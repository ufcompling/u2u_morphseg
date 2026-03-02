/**
 * useTurtleShell.ts
 * Location: src/hooks/useTurtleShell.ts
 *
 * Purpose:
 *   Compositor hook for the TurtleShell active learning workflow.
 *   Wires together focused subsystem hooks and owns the cross-cutting
 *   lifecycle logic (cycle transitions, data flow, state restore).
 *
 *   Subsystem hooks:
 *     useProjectDB()            → IndexedDB persistence
 *     usePyodideWorker()        → CRF training/inference via Web Worker
 *     useTrainingOrchestrator() → Training cycle + inference execution
 *     useAnnotationState()      → Word list + boundary editing
 *
 *   Cycle data flow:
 *     Cycle N trains on [original annotated + all prior user annotations].
 *     After the user submits annotations:
 *       1. Boundary decisions are converted to .tgt lines
 *       2. Those lines are appended to the "annotated" file in IndexedDB
 *       3. The "unannotated" file is replaced with the residual
 *     So cycle N+1 naturally reads a larger training set and smaller pool.
 *
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  type WorkflowStage,
  type ModelConfig,
  type FileRole,
  type StoredFile,
  type TrainingStep,
  type TrainingResult,
  type AnnotationWord,
  type CycleSnapshot,
  DEFAULT_MODEL_CONFIG,
} from "../lib/types";
import {
  annotationToTgtLine,
  getFileByRole,
  deriveCompletedStages,
  triggerDownload,
  validateTgtFormat,
} from "../lib/format-utils";
import { log } from "../lib/logger";
import { useProjectDB } from "./useProjectDB";
import { usePyodideWorker } from "./usePyodideWorker";
import { useTrainingOrchestrator } from "./useTrainingOrchestrator";
import { useAnnotationState } from "./useAnnotationState";

const logger = log('turtleshell');

// -- Compositor return type ---------------------------------------------------

export interface UseTurtleshellReturn {
  // Workflow
  currentStage: WorkflowStage;
  completedStages: WorkflowStage[];
  goToStage: (stage: WorkflowStage) => void;

  // Status
  pyodideReady: boolean;
  pyodideLoading: boolean;
  pyodideError: string | null;
  modelRestored: boolean;
  indexedDBReady: boolean;

  // Files
  files: StoredFile[];
  isUploading: boolean;
  handleUpload: (files: FileList | null) => void;
  handleAssignRole: (fileId: string, role: FileRole) => void;
  handleRemoveFile: (fileId: string) => void;

  // Config
  modelConfig: ModelConfig;
  setModelConfig: (config: ModelConfig) => void;

  // Training
  trainingSteps: TrainingStep[];
  currentIteration: number;
  totalIterations: number;
  isTrainingComplete: boolean;
  handleStartTraining: () => Promise<void>;

  // Annotation
  annotationWords: AnnotationWord[];
  totalAnnotationWords: number;
  handleUpdateBoundaries: (wordId: string, boundaryIndices: number[]) => void;
  handleSubmitAnnotations: () => Promise<void>;
  handleSkipAnnotation: () => void;

  // Results
  trainingResult: TrainingResult | null;
  previousResult: TrainingResult | null;
  cycleHistory: CycleSnapshot[];
  incrementContent: string;
  residualContent: string;
  evaluationContent: string;
  handleDownloadIncrement: () => void;
  handleDownloadResidual: () => void;
  handleDownloadEvaluation: () => void;
  handleNewCycle: () => void;
  handleStartOver: () => Promise<void>;

  // Inference
  isRunningInference: boolean;
  inferenceComplete: boolean;
  inferenceStats: { totalWords: number; processedWords: number } | null;
  handleRunInference: () => Promise<void>;
  handleDownloadPredictions: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTurtleshell(): UseTurtleshellReturn {
  const projectDB = useProjectDB();
  const { pyodideReady, pyodideLoading, pyodideError, modelRestored, runCycle, runInference, wipeVfs } =
    usePyodideWorker();
  const hasRestored = useRef(false);

  // ── Workflow navigation ─────────────────────────────────────────────────

  const [currentStage, setCurrentStage] = useState<WorkflowStage>("ingestion");
  const [completedStages, setCompletedStages] = useState<WorkflowStage[]>([]);

  const goToStage = useCallback(
    (stage: WorkflowStage) => {
      if (!completedStages.includes(currentStage)) {
        setCompletedStages((prev) => [...prev, currentStage]);
      }
      setCurrentStage(stage);
      projectDB.saveProjectMeta({ currentStage: stage });
    },
    [currentStage, completedStages, projectDB]
  );

  // ── Core state ──────────────────────────────────────────────────────────

  const [modelConfig, setModelConfigLocal] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [currentIteration, setCurrentIteration] = useState(1);
  const cumulativeSelectSize = useRef(0);

  const setModelConfig = useCallback(
    (config: ModelConfig) => {
      setModelConfigLocal(config);
      projectDB.saveProjectMeta({ modelConfig: config });
    },
    [projectDB]
  );

  // ── File management ─────────────────────────────────────────────────────

  const files = projectDB.files;
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      setIsUploading(true);

      const readers = Array.from(fileList).map(
        (file) =>
          new Promise<Omit<StoredFile, "id">>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                size: file.size,
                content: reader.result as string,
                role: null,
                validationStatus: "pending",
                uploadedAt: new Date(),
              });
            };
            reader.readAsText(file);
          })
      );

      Promise.all(readers).then(async (newFiles) => {
        try {
          await projectDB.saveFiles(newFiles);
        } catch (err) {
          logger.error(" Failed to persist files:", err);
        }
        setIsUploading(false);
      });
    },
    [projectDB]
  );

  const handleAssignRole = useCallback(
    (fileId: string, role: FileRole) => {
      projectDB.updateFileRole(fileId, role);

      // Validate .tgt format now that we know the file's intended role
      const file = files.find((f) => f.id === fileId);
      if (file) {
        const { valid } = validateTgtFormat(file.content);
        projectDB.updateFileValidation(fileId, valid ? "valid" : "invalid");
      }
    },
    [projectDB, files]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      projectDB.removeFile(fileId);
    },
    [projectDB]
  );

  // ── Subsystem hooks ─────────────────────────────────────────────────────

  const training = useTrainingOrchestrator({
    files,
    modelConfig,
    currentIteration,
    cumulativeSelectSize,
    runCycle,
    runInference,
  });

  const annotations = useAnnotationState();

  // ── Results state ───────────────────────────────────────────────────────

  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [previousResult, setPreviousResult] = useState<TrainingResult | null>(null);
  const cycleHistory = projectDB.cycleHistory;

  // ── Deferred auto-start training ────────────────────────────────────────
  // Set to true by handleNewCycle. Can't call startTraining directly because
  // its closure would capture the stale currentIteration.
  const [autoStartTraining, setAutoStartTraining] = useState(false);

  useEffect(() => {
    if (autoStartTraining) {
      setAutoStartTraining(false);
      goToStage("training");
      training.startTraining();
    }
  }, [autoStartTraining]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore from IndexedDB on mount ─────────────────────────────────────

  useEffect(() => {
    if (!projectDB.dbReady || hasRestored.current) return;
    hasRestored.current = true;

    const p = projectDB.project;
    if (!p) {
      projectDB.initProject();
      return;
    }

    setCurrentStage(p.currentStage);
    setCompletedStages(deriveCompletedStages(p.currentStage));
    setModelConfigLocal(p.modelConfig);
    setCurrentIteration(p.currentIteration);
    cumulativeSelectSize.current = p.cumulativeSelectSize;

    if (p.currentStage === "annotation") {
      projectDB.loadAnnotations(p.currentIteration).then((words) => {
        if (words.length > 0) {
          annotations.setAnnotationWords(words);
          // TODO: restore isTrainingComplete flag from DB instead of inferring
        }
      });
    }

    if (p.currentStage === "results" && projectDB.cycleHistory.length > 0) {
      const latest = projectDB.cycleHistory[projectDB.cycleHistory.length - 1];
      projectDB.getCycleContent(latest.iteration).then((content) => {
        if (content) {
          // Training orchestrator state isn't directly settable from outside,
          // but the results page only needs trainingResult + cycleHistory.
          // TODO: consider exposing a restoreCycleContent method on the orchestrator
        }
      });
      setTrainingResult({
        precision: latest.precision,
        recall: latest.recall,
        f1: latest.f1,
        totalWords: 0,
        annotatedCount: latest.annotatedCount,
        iterationNumber: latest.iteration,
      });
    }
  }, [projectDB.dbReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync training orchestrator output to annotations ────────────────────
  // When training completes, push the increment words into the annotation hook
  // and persist them to IndexedDB.

  useEffect(() => {
    if (training.isTrainingComplete && training.incrementWords.length > 0) {
      annotations.setAnnotationWords(training.incrementWords);
      projectDB.saveAnnotationWords(currentIteration, training.incrementWords);
      projectDB.saveProjectMeta({
        cumulativeSelectSize: cumulativeSelectSize.current,
      });
    }
  }, [training.isTrainingComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Training action (wraps orchestrator + navigation) ───────────────────

  const handleStartTraining = useCallback(async () => {
    goToStage("training");
    await training.startTraining();
  }, [goToStage, training]);

  // ── Annotation actions ──────────────────────────────────────────────────

  const handleUpdateBoundaries = useCallback(
    (wordId: string, boundaryIndices: number[]) => {
      annotations.updateBoundaries(wordId, boundaryIndices);
      const boundaries = boundaryIndices.map((index) => ({ index }));
      projectDB.confirmAnnotation(currentIteration, wordId, boundaries);
    },
    [currentIteration, projectDB, annotations]
  );

  /**
   * Submit annotations — the cycle data flow fix:
   * 1. Persist the cycle snapshot to IndexedDB
   * 2. Convert annotated words to .tgt and APPEND to the training file
   * 3. REPLACE the unannotated pool with the residual
   */
  const handleSubmitAnnotations = useCallback(async () => {
    const result = training.pendingCycleResult ?? {
      precision: 0,
      recall: 0,
      f1: 0,
      totalWords: 0,
      annotatedCount: annotations.annotationWords.length,
      iterationNumber: currentIteration,
    };

    setPreviousResult(trainingResult);
    setTrainingResult(result);

    await projectDB.saveCycle({
      iteration: result.iterationNumber,
      precision: result.precision,
      recall: result.recall,
      f1: result.f1,
      annotatedCount: result.annotatedCount,
      incrementContent: training.incrementContent,
      residualContent: training.residualContent,
      evaluationContent: training.evaluationContent,
    });

    // Merge user annotations back into the training file
    const annotatedFile = getFileByRole(files, "annotated");
    if (annotatedFile) {
      const newTgtLines = annotations.annotationWords.map(annotationToTgtLine).join("\n");
      const merged = annotatedFile.content.trimEnd() + "\n" + newTgtLines;
      await projectDB.updateFileContent(annotatedFile.id, merged);
    }

    // Replace unannotated pool with residual
    const unannotatedFile = getFileByRole(files, "unannotated");
    if (unannotatedFile && training.residualContent) {
      await projectDB.updateFileContent(unannotatedFile.id, training.residualContent);
    }

    goToStage("results");
  }, [
    goToStage, training, trainingResult, currentIteration,
    annotations, files, projectDB,
  ]);

  const handleSkipAnnotation = useCallback(() => {
    goToStage("results");
  }, [goToStage]);

  // ── Downloads ───────────────────────────────────────────────────────────

  const handleDownloadIncrement = useCallback(() => {
    triggerDownload(training.incrementContent, `increment_cycle${currentIteration}.tgt`);
  }, [training.incrementContent, currentIteration]);

  const handleDownloadResidual = useCallback(() => {
    triggerDownload(training.residualContent, `residual_cycle${currentIteration}.tgt`);
  }, [training.residualContent, currentIteration]);

  const handleDownloadEvaluation = useCallback(() => {
    triggerDownload(training.evaluationContent, `evaluation_cycle${currentIteration}.txt`);
  }, [training.evaluationContent, currentIteration]);

  const handleDownloadPredictions = useCallback(() => {
    triggerDownload(training.predictionsContent, `predictions_cycle${currentIteration}.tgt`);
  }, [training.predictionsContent, currentIteration]);

  // ── Inference ───────────────────────────────────────────────────────────

  const handleRunInference = useCallback(async () => {
    await training.startInference();
  }, [training]);

  // ── Cycle transitions ─────────────────────────────────────────────────

  const handleNewCycle = useCallback(() => {
    const nextIteration = currentIteration + 1;
    setCurrentIteration(nextIteration);

    annotations.resetAnnotations();
    training.resetTrainingState();
    training.resetInferenceState();

    projectDB.saveProjectMeta({
      currentIteration: nextIteration,
      currentStage: "training",
    });

    setAutoStartTraining(true);
  }, [currentIteration, projectDB, annotations, training]);

  const handleStartOver = useCallback(async () => {
    setCurrentStage("ingestion");
    setCompletedStages([]);
    setModelConfigLocal(DEFAULT_MODEL_CONFIG);
    setCurrentIteration(1);
    cumulativeSelectSize.current = 0;
    setTrainingResult(null);
    setPreviousResult(null);
    setAutoStartTraining(false);

    annotations.resetAnnotations();
    training.resetTrainingState();
    training.resetInferenceState();

    await projectDB.clearAll();
    await projectDB.initProject();
    wipeVfs().catch((err) => logger.warn(" VFS wipe failed:", err));
    hasRestored.current = true;
  }, [projectDB, wipeVfs, annotations, training]);

  // ── Return (same shape — no breaking changes to consumers) ──────────────

  return {
    // Workflow
    currentStage,
    completedStages,
    goToStage,

    // Status
    pyodideReady,
    pyodideLoading,
    pyodideError,
    modelRestored,
    indexedDBReady: projectDB.dbReady,

    // Files
    files,
    isUploading,
    handleUpload,
    handleAssignRole,
    handleRemoveFile,

    // Config
    modelConfig,
    setModelConfig,

    // Training
    trainingSteps: training.trainingSteps,
    currentIteration,
    totalIterations: modelConfig.iterations,
    isTrainingComplete: training.isTrainingComplete,
    handleStartTraining,

    // Annotation
    annotationWords: annotations.annotationWords,
    totalAnnotationWords: annotations.totalAnnotationWords,
    handleUpdateBoundaries,
    handleSubmitAnnotations,
    handleSkipAnnotation,

    // Results
    trainingResult,
    previousResult,
    cycleHistory,
    incrementContent: training.incrementContent,
    residualContent: training.residualContent,
    evaluationContent: training.evaluationContent,
    handleDownloadIncrement,
    handleDownloadResidual,
    handleDownloadEvaluation,
    handleNewCycle,
    handleStartOver,

    // Inference
    isRunningInference: training.isRunningInference,
    inferenceComplete: training.inferenceComplete,
    inferenceStats: training.inferenceStats,
    handleRunInference,
    handleDownloadPredictions,
  };
}