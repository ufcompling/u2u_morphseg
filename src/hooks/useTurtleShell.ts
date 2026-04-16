import { useState, useCallback, useRef, useEffect } from "react";
import {
  type WorkflowStage,
  type ModelConfig,
  type FileRole,
  type fileData,
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
} from "../lib/format-utils";
import { log } from "../lib/logger";
import { useProjectDB } from "./useProjectDB";
import { usePyodideWorker } from "./usePyodideWorker";
import { useTrainingOrchestrator } from "./useTrainingOrchestrator";
import { useAnnotationState } from "./useAnnotationState";
import { setLanguage } from "../lib/db";

const logger = log('turtleshell');

// -- Compositor return type ---------------------------------------------------

export interface UseTurtleshellReturn {
  language: string;
  onLanguageChange: (lang: string) => void;
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
  files: fileData[];
  isUploading: boolean;
  handleUpload: (files: FileList | null) => void;
  handleAssignRole: (filePath: string, role: FileRole) => void;
  handleRemoveFile: (filePath: string) => void;

  // Config
  modelConfig: ModelConfig;
  setModelConfig: (config: ModelConfig) => void;

  // Training
  trainingSteps: TrainingStep[];
  currentIteration: number;
  isTrainingComplete: boolean;
  handleStartTraining: () => Promise<void>;

  // Annotation
  annotationWords: AnnotationWord[];
  totalAnnotationWords: number;
  handleUpdateBoundaries: (wordId: string, boundaryIndices: number[]) => void;
  handleBulkUpdateBoundaries: (updates: Array<{ wordId: string; boundaryIndices: number[] }>) => void;
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
  handleDownloadSnapshot: () => Promise<void>;
  handleReadSnapshot: (snapshotJson: string) => Promise<void>;

  // Inference
  isRunningInference: boolean;
  inferenceComplete: boolean;
  inferenceStats: { totalWords: number; processedWords: number } | null;
  handleRunInference: () => Promise<void>;
  handleDownloadPredictions: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTurtleshell(): UseTurtleshellReturn {
  const [language, setLanguageState] = useState<string>("");
  // Track the stage here so handleLanguageChange / setModelConfig can read it
  // without a stale closure. This ref is kept in sync with currentStage below.
  const currentStageRef = useRef<WorkflowStage>("config");

  const handleLanguageChange = useCallback((lang: string) => {
    setLanguageState(lang);
    // Only push to the worker (which sets window.language and the VFS path
    // prefix) once the user has left the config stage. While they are still
    // typing the language name we must not create /data/<partial>/ dirs.
    if (currentStageRef.current !== "config") {
      setLanguage(lang);
    }
  }, []);

  const projectDB = useProjectDB();
  const [rolesMap, setRolesMap] = useState<Record<string, FileRole | null>>({});  

  // Sync language to worker ONLY when past the config stage.
  useEffect(() => {
    if (currentStageRef.current !== "config") {
      setLanguage(language);
    }
  }, [language]);

  const { pyodideReady, pyodideLoading, pyodideError, modelRestored, runCycle, runInference, wipeVfs } =
    usePyodideWorker();
  const hasRestored = useRef(false);

  const files: fileData[] = projectDB.files.map(fd => ({
    fileName: fd.fileName,
    fileSize: fd.fileSize ?? 0,
    fileContent: typeof fd.fileContent === "string" ? fd.fileContent : "",
    fileRole: (rolesMap as Record<string, FileRole | null>)[fd.filePath] ?? null,
    fileType: fd.fileType ?? "text",
    createdAt: new Date(fd.createdAt ?? Date.now()),
    filePath: fd.filePath ?? "",
    validationStatus: "pending",
  }));

  // ── Workflow navigation ─────────────────────────────────────────────────

  const [currentStage, setCurrentStage] = useState<WorkflowStage>("config");
  const [completedStages, setCompletedStages] = useState<WorkflowStage[]>([]);

  const goToStage = useCallback(
  (stage: WorkflowStage) => {
    const leavingConfig = currentStageRef.current === "config" && stage !== "config";
    currentStageRef.current = stage;
    setCompletedStages(deriveCompletedStages(stage));
    setCurrentStage(stage);
    if (leavingConfig) {
      // First time leaving config: flush the language to the worker and persist
      // the full model config + stage in one shot. Nothing was written before.
      setLanguage((window as any).language ?? "");
      projectDB.saveProjectMeta({ currentStage: stage, modelConfig: modelConfigRef.current });
    } else {
      projectDB.saveProjectMeta({ currentStage: stage });
    }
  },
  [projectDB]
);

  // ── Core state ──────────────────────────────────────────────────────────

  const [modelConfig, setModelConfigLocal] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const modelConfigRef = useRef<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [currentIteration, setCurrentIteration] = useState(1);
  const cumulativeSelectSize = useRef(0);

  const setModelConfig = useCallback(
    (config: ModelConfig) => {
      setModelConfigLocal(config);
      modelConfigRef.current = config;
      // Skip DB write while on the config stage — goToStage will do one bulk
      // flush when the user clicks "Upload Files".
      if (currentStageRef.current !== "config") {
        projectDB.saveProjectMeta({ modelConfig: config });
      }
    },
    [projectDB]
  );

  // ── File management ─────────────────────────────────────────────────────

  const [isUploading, setIsUploading] = useState(false);


  // Sync currentStage with projectDB.project?.currentStage (e.g. after snapshot restore)
  useEffect(() => {
    if (!projectDB.project) return;
    currentStageRef.current = projectDB.project.currentStage;
    setCurrentStage(projectDB.project.currentStage);
    setCompletedStages(deriveCompletedStages(projectDB.project.currentStage));
  }, [projectDB.project?.currentStage]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      if (!pyodideReady) return;
      setIsUploading(true);
      try {
        for (const file of Array.from(fileList)) {
          let content: string | Uint8Array;
          if (file.type.startsWith('text/')) {
            content = await file.text();
          } else {
            const buffer = await file.arrayBuffer();
            content = new Uint8Array(buffer);
          }
          await projectDB.importFile(file.name, content);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [projectDB, pyodideReady]
  );

  const handleAssignRole = useCallback(
    (filePath: string, role: FileRole) => {
      setRolesMap((prev) => {
        const next = { ...prev, [filePath]: role };
        projectDB.saveProjectMeta({ rolesMap: next });
        return next;
      });
    },
    [projectDB]
  );

  const handleRemoveFile = useCallback(
    async (filePath: string) => {
      await projectDB.deleteFile(filePath);
      if (typeof projectDB.loadFiles === 'function') {
        await projectDB.loadFiles();
      }
      setRolesMap((prev) => {
        const copy = { ...prev };
        delete copy[filePath];
        projectDB.saveProjectMeta({ rolesMap: copy });
        return copy;
      });
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
  // Set to true by handleNewCycle / handleSubmitAnnotations. Can't call
  // startTraining directly because its closure would capture stale currentIteration.
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
    currentStageRef.current = p.currentStage;
    setCompletedStages(deriveCompletedStages(p.currentStage));
    setModelConfigLocal(p.modelConfig);
    modelConfigRef.current = p.modelConfig;
    setCurrentIteration(p.currentIteration);
    cumulativeSelectSize.current = p.cumulativeSelectSize;
    if (p.rolesMap) setRolesMap(p.rolesMap);

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
  // When training completes, push the increment words into the annotation hook,
  // persist them to IndexedDB, and set trainingResult so the results page has
  // data before the user goes through annotation.

  useEffect(() => {
    if (training.isTrainingComplete && training.incrementWords.length > 0) {
      annotations.setAnnotationWords(training.incrementWords);
      projectDB.saveAnnotationWords(currentIteration, training.incrementWords);
      projectDB.saveProjectMeta({
        cumulativeSelectSize: cumulativeSelectSize.current,
      });
      // Set result now so the results page has data when we navigate there
      // before the user has gone through annotation.
      if (training.pendingCycleResult) {
        setPreviousResult(trainingResult);
        setTrainingResult(training.pendingCycleResult);
      }
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
   * Submit annotations — cycle data flow:
   * 1. Persist the cycle snapshot to IndexedDB
   * 2. Convert annotated words to .tgt and APPEND to the training file
   * 3. REPLACE the unannotated pool with the residual
   * 4. Auto-start the next training cycle (annotation is now the last step)
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
      const merged = annotatedFile.fileContent.trimEnd() + "\n" + newTgtLines;
      await projectDB.saveFile(annotatedFile.filePath, merged);
    }

    // Replace unannotated pool with residual
    const unannotatedFile = getFileByRole(files, "unannotated");
    if (unannotatedFile && training.residualContent) {
      await projectDB.saveFile(unannotatedFile.filePath, training.residualContent);
    }

    // Annotation is the last step — kick off the next cycle immediately.
    // Mirrors handleNewCycle but runs after persistence so we don't lose data.
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
  }, [
    goToStage, training, currentIteration,
    annotations, files, projectDB,
  ]);

  const handleBulkUpdateBoundaries = useCallback(
    (updates: Array<{ wordId: string; boundaryIndices: number[] }>) => {
      const updatedWords = annotations.annotationWords.map((w) => {
        const update = updates.find((u) => u.wordId === w.id);
        if (!update) return w;
        return {
          ...w,
          boundaries: update.boundaryIndices.map((index) => ({ index })),
          confirmed: true,
        };
      });
      annotations.setAnnotationWords(updatedWords);
      projectDB.saveAnnotationWords(currentIteration, updatedWords);
    },
    [annotations, currentIteration, projectDB]
  );

  const handleSkipAnnotation = useCallback(() => {
    // Skipping annotation returns to results rather than starting the next cycle —
    // the user didn't label anything so we let them decide from the results page.
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

  // ── Cycle transitions ────────────────────────────────────────────────────

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
    setCurrentStage("config");
    currentStageRef.current = "config";
    setCompletedStages([]);
    setModelConfigLocal(DEFAULT_MODEL_CONFIG);
    modelConfigRef.current = DEFAULT_MODEL_CONFIG;
    setCurrentIteration(1);
    cumulativeSelectSize.current = 0;
    setTrainingResult(null);
    setPreviousResult(null);
    setAutoStartTraining(false);
    setRolesMap({});

    annotations.resetAnnotations();
    training.resetTrainingState();
    training.resetInferenceState();

    await projectDB.clearAll();
    await projectDB.initProject();
    wipeVfs().catch((err) => logger.warn(" VFS wipe failed:", err));
    hasRestored.current = true;
  }, [projectDB, wipeVfs, annotations, training]);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    language,
    onLanguageChange: handleLanguageChange,
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
    isTrainingComplete: training.isTrainingComplete,
    handleStartTraining,

    // Annotation
    annotationWords: annotations.annotationWords,
    totalAnnotationWords: annotations.totalAnnotationWords,
    handleUpdateBoundaries,
    handleBulkUpdateBoundaries,
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
    handleDownloadSnapshot: projectDB.downloadSnapshot,
    handleReadSnapshot: async (snapshotJson: string) => {
      await projectDB.readSnapshot(snapshotJson);
      // Sync React language state from window.language set inside readSnapshot
      const restoredLang = (window as any).language as string | undefined;
      if (restoredLang && restoredLang !== language) {
        handleLanguageChange(restoredLang);
      }
      // Parse project meta directly from snapshot bytes to avoid stale React state.
      // (projectDB.project reflects the old state until the next React re-render)
      try {
        const snap = JSON.parse(snapshotJson) as Record<string, number[]>;
        if (snap['project.json']) {
          const text = new TextDecoder().decode(new Uint8Array(snap['project.json']));
          const meta = JSON.parse(text);
          // Sync all iteration/config state that the initial-load effect would set.
          // hasRestored.current=true (set in handleStartOver) blocks that effect, so
          // we must sync here — otherwise currentIteration stays stale, causing gold
          // file saves and handleSubmitAnnotations to use the wrong cycle number.
          if (meta?.currentIteration) {
            setCurrentIteration(meta.currentIteration);
          }
          if (meta?.modelConfig) {
            setModelConfigLocal(meta.modelConfig);
          }
          if (meta?.cumulativeSelectSize !== undefined) {
            cumulativeSelectSize.current = meta.cumulativeSelectSize;
          }
          if (meta?.currentStage === 'annotation') {
            const words = await projectDB.loadAnnotations(meta.currentIteration);
            if (words.length > 0) {
              annotations.setAnnotationWords(words);
            }
          }
          if (meta?.rolesMap) setRolesMap(meta.rolesMap);
        }
      } catch {}
    },

    // Inference
    isRunningInference: training.isRunningInference,
    inferenceComplete: training.inferenceComplete,
    inferenceStats: training.inferenceStats,
    handleRunInference,
    handleDownloadPredictions,
  };
}