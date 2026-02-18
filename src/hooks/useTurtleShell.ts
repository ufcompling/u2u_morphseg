/**
 * use-turtleshell.ts
 * Location: src/hooks/use-turtleshell.ts
 *
 * Purpose:
 *   Central state machine for the TurtleShell active learning workflow.
 *   Owns UI state (stage navigation, training steps, annotation focus) and
 *   coordinates between two subsystem hooks:
 *     - useProjectDB()      → IndexedDB persistence (files, cycles, annotations)
 *     - usePyodideWorker()  → CRF training/inference via Web Worker + WASM
 *
 * Cycle data flow (the critical part):
 *   Cycle N trains on [original annotated + all prior user annotations].
 *   It selects from the residual pool (NOT the original unannotated file).
 *   After the user submits annotations:
 *     1. Their boundary decisions are converted to .tgt format lines
 *     2. Those lines are appended to the "annotated" file's content in IndexedDB
 *     3. The "unannotated" file's content is replaced with the residual
 *   So the next cycle naturally reads the grown training set and shrunken pool.
 *
 * Author: Joshua / Evan / Yumandy
 * Created: 2026-02-17
 * Version: 3.0.0
 *
 * Dependencies: react 18+, useProjectDB, usePyodideWorker
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  type WorkflowStage,
  type StoredFile,
  type FileRole,
  type ModelConfig,
  type TrainingStep,
  type AnnotationWord,
  type TrainingResult,
  type CycleSnapshot,
  type TrainingCycleConfig,
  type InferenceConfig,
  DEFAULT_MODEL_CONFIG,
  INITIAL_TRAINING_STEPS,
} from "../lib/types";
import { useProjectDB } from "./useProjectDB";
import { usePyodideWorker } from "./usePyodideWorker";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFileContent(files: StoredFile[], role: FileRole): string {
  return files.find((f) => f.role === role)?.content ?? "";
}

function getFileByRole(files: StoredFile[], role: FileRole): StoredFile | undefined {
  return files.find((f) => f.role === role);
}

/**
 * Derive .src from .tgt — strips boundary markers so each line is just
 * space-separated characters. Python needs both formats.
 */
function tgtToSrc(tgt: string): string {
  return tgt
    .split("\n")
    .map((line) => line.replace(/!/g, "").replace(/\s+/g, " ").trim())
    .join("\n");
}

/** Trigger a browser file download from an in-memory string. */
function triggerDownload(content: string, filename: string) {
  if (!content) return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert an annotated word (with boundary indices) back to .tgt format.
 * e.g. word="running", boundaries=[{index:2}] → "run!ning"
 *
 * MorphemeBoundary.index = the index of the character AFTER which a boundary exists.
 */
function annotationToTgtLine(word: AnnotationWord): string {
  const chars = word.word.split("");
  const boundarySet = new Set(word.boundaries.map((b) => b.index));
  let result = "";
  for (let i = 0; i < chars.length; i++) {
    result += chars[i];
    if (boundarySet.has(i) && i < chars.length - 1) {
      result += "!";
    }
  }
  return result;
}

/** Derive completed stages from the current position in the workflow. */
function deriveCompletedStages(current: WorkflowStage): WorkflowStage[] {
  const order: WorkflowStage[] = ["ingestion", "config", "training", "annotation", "results"];
  const idx = order.indexOf(current);
  return idx > 0 ? order.slice(0, idx) : [];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTurtleshell() {
  const projectDB = useProjectDB();
  const { pyodideReady, pyodideLoading, pyodideError, modelRestored, runCycle, runInference, wipeVfs } = usePyodideWorker();
  const hasRestored = useRef(false);

  // ── Workflow navigation ──────────────────────────────────────────────────

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

  // ── Backend status ─────────────────────────────────────────────────────

  const indexedDBReady = projectDB.dbReady;

  // ── Core state ─────────────────────────────────────────────────────────

  const [modelConfig, setModelConfigLocal] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [currentIteration, setCurrentIteration] = useState(1);
  const cumulativeSelectSize = useRef(0);

  // File content snapshots from the latest cycle
  const [incrementContent, setIncrementContent] = useState("");
  const [residualContent, setResidualContent] = useState("");
  const [evaluationContent, setEvaluationContent] = useState("");

  // ── Restore from IndexedDB on mount ────────────────────────────────────

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
          setAnnotationWords(words);
          setCurrentWordIndex(0);
          setIsTrainingComplete(true);
        }
      });
    }

    if (p.currentStage === "results" && projectDB.cycleHistory.length > 0) {
      const latest = projectDB.cycleHistory[projectDB.cycleHistory.length - 1];
      projectDB.getCycleContent(latest.iteration).then((content) => {
        if (content) {
          setIncrementContent(content.incrementContent);
          setResidualContent(content.residualContent);
          setEvaluationContent(content.evaluationContent);
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

  // ── Model config with persistence ──────────────────────────────────────

  const setModelConfig = useCallback(
    (config: ModelConfig) => {
      setModelConfigLocal(config);
      projectDB.saveProjectMeta({ modelConfig: config });
    },
    [projectDB]
  );

  // ── File management (DB-backed) ───────────────────────────────────────

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
          console.error("[useTurtleshell] Failed to persist files:", err);
        }
        setIsUploading(false);
      });
    },
    [projectDB]
  );

  const handleAssignRole = useCallback(
    (fileId: string, role: FileRole) => {
      projectDB.updateFileRole(fileId, role);
    },
    [projectDB]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      projectDB.removeFile(fileId);
    },
    [projectDB]
  );

  // ── Training ───────────────────────────────────────────────────────────

  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>(INITIAL_TRAINING_STEPS);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);

  // Set to true by handleNewCycle to trigger training on the NEXT render.
  // Can't call handleStartTraining directly because its closure would still
  // capture the stale currentIteration before React flushes the update.
  const [autoStartTraining, setAutoStartTraining] = useState(false);

  const updateStep = useCallback(
    (stepId: string, done: boolean, detail?: string) => {
      setTrainingSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, status: done ? "complete" : "active", detail: detail ?? s.detail }
            : s
        )
      );
    },
    []
  );

  // Holds real metrics from the latest completed cycle until the user
  // submits their annotations, at which point it becomes the committed result.
  const [pendingCycleResult, setPendingCycleResult] = useState<TrainingResult | null>(null);

  const handleStartTraining = useCallback(async () => {
    goToStage("training");
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);

    // Read current file content — on cycle 2+ these are the UPDATED versions
    // because handleSubmitAnnotations merges annotations back and swaps the pool.
    const trainTgt = getFileContent(files, "annotated");
    const testTgt = getFileContent(files, "evaluation");
    const selectTgt = getFileContent(files, "unannotated");
    const selectSrc = tgtToSrc(selectTgt);

    const cycleConfig: TrainingCycleConfig = {
      trainTgt,
      testTgt,
      selectTgt,
      selectSrc,
      incrementSize: modelConfig.incrementSize,
      maxIterations: 100,
      delta: 4,
      selectSize: cumulativeSelectSize.current,
    };

    try {
      const result = await runCycle(cycleConfig, (stepId, done, detail) => {
        updateStep(stepId, done, detail);
      });

      cumulativeSelectSize.current += result.incrementWords.length;
      await projectDB.saveProjectMeta({
        cumulativeSelectSize: cumulativeSelectSize.current,
      });

      setAnnotationWords(result.incrementWords);
      setCurrentWordIndex(0);
      setIsTrainingComplete(true);
      setIncrementContent(result.incrementContent ?? "");
      setResidualContent(result.residualContent ?? "");
      setEvaluationContent(result.evaluationContent ?? "");

      // Persist annotation words so they survive refresh
      await projectDB.saveAnnotationWords(currentIteration, result.incrementWords);

      // Stash result so handleSubmitAnnotations can use real metrics
      const totalWords =
        selectTgt.split("\n").filter(Boolean).length +
        trainTgt.split("\n").filter(Boolean).length;

      setPendingCycleResult({
        precision: result.precision,
        recall: result.recall,
        f1: result.f1,
        totalWords,
        annotatedCount: cumulativeSelectSize.current,
        iterationNumber: currentIteration,
      });
    } catch (err) {
      console.error("[training] cycle failed", err);
      setTrainingSteps((prev) =>
        prev.map((s) =>
          s.status === "active" ? { ...s, status: "error", detail: String(err) } : s
        )
      );
    }
  }, [goToStage, files, modelConfig, runCycle, updateStep, currentIteration, projectDB]);

  // Deferred training trigger — fires on the render AFTER handleNewCycle sets
  // the flag, so handleStartTraining's closure has the updated currentIteration.
  useEffect(() => {
    if (autoStartTraining) {
      setAutoStartTraining(false);
      handleStartTraining();
    }
  }, [autoStartTraining, handleStartTraining]);

  // ── Results ────────────────────────────────────────────────────────────

  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [previousResult, setPreviousResult] = useState<TrainingResult | null>(null);
  const cycleHistory = projectDB.cycleHistory;

  // Full-corpus inference state
  const [isRunningInference, setIsRunningInference] = useState(false);
  const [inferenceComplete, setInferenceComplete] = useState(false);
  const [inferenceStats, setInferenceStats] = useState<{
    totalWords: number;
    processedWords: number;
  } | null>(null);
  const [predictionsContent, setPredictionsContent] = useState("");

  // ── Annotation ─────────────────────────────────────────────────────────

  const [annotationWords, setAnnotationWords] = useState<AnnotationWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const handleUpdateBoundaries = useCallback(
    (wordId: string, boundaryIndices: number[]) => {
      const boundaries = boundaryIndices.map((index) => ({ index }));
      setAnnotationWords((prev) =>
        prev.map((w) => (w.id === wordId ? { ...w, boundaries } : w))
      );
      projectDB.confirmAnnotation(currentIteration, wordId, boundaries);
    },
    [currentIteration, projectDB]
  );

  /**
   * Submit annotations — this is where the cycle data flow fix lives.
   *
   * 1. Persist the cycle snapshot (metrics + file content) to IndexedDB
   * 2. Convert annotated words to .tgt format and APPEND to the training file
   * 3. REPLACE the unannotated pool with the residual from this cycle
   *
   * Steps 2 & 3 are what makes cycle N+1 train on more data and select
   * from a smaller pool. Without them, every cycle re-reads the originals.
   */
  const handleSubmitAnnotations = useCallback(async () => {
    const result = pendingCycleResult ?? {
      precision: 0,
      recall: 0,
      f1: 0,
      totalWords: 0,
      annotatedCount: annotationWords.length,
      iterationNumber: currentIteration,
    };

    setPreviousResult(trainingResult);
    setTrainingResult(result);

    // Persist cycle snapshot with file content for later download
    await projectDB.saveCycle({
      iteration: result.iterationNumber,
      precision: result.precision,
      recall: result.recall,
      f1: result.f1,
      annotatedCount: result.annotatedCount,
      incrementContent,
      residualContent,
      evaluationContent,
    });

    // ── DATA FLOW FIX ──────────────────────────────────────────────────
    // Merge user annotations back into the training file so the next cycle
    // trains on a larger dataset. Replace the unannotated pool with the
    // residual so the next cycle selects from a smaller pool.

    const annotatedFile = getFileByRole(files, "annotated");
    if (annotatedFile) {
      const newTgtLines = annotationWords.map(annotationToTgtLine).join("\n");
      const existing = annotatedFile.content.trimEnd();
      const merged = existing + "\n" + newTgtLines;
      await projectDB.updateFileContent(annotatedFile.id, merged);
    }

    const unannotatedFile = getFileByRole(files, "unannotated");
    if (unannotatedFile && residualContent) {
      await projectDB.updateFileContent(unannotatedFile.id, residualContent);
    }
    // ── END DATA FLOW FIX ──────────────────────────────────────────────

    goToStage("results");
  }, [
    goToStage, pendingCycleResult, trainingResult, currentIteration,
    annotationWords, files, incrementContent, residualContent,
    evaluationContent, projectDB,
  ]);

  const handleSkipAnnotation = useCallback(() => {
    goToStage("results");
  }, [goToStage]);

  // ── Downloads ──────────────────────────────────────────────────────────

  const handleDownloadIncrement = useCallback(() => {
    triggerDownload(incrementContent, `increment_cycle${currentIteration}.tgt`);
  }, [incrementContent, currentIteration]);

  const handleDownloadResidual = useCallback(() => {
    triggerDownload(residualContent, `residual_cycle${currentIteration}.tgt`);
  }, [residualContent, currentIteration]);

  const handleDownloadEvaluation = useCallback(() => {
    triggerDownload(evaluationContent, `evaluation_cycle${currentIteration}.txt`);
  }, [evaluationContent, currentIteration]);

  // ── Inference (run trained model over entire residual) ─────────────────

  const handleRunInference = useCallback(async () => {
    if (!residualContent || isRunningInference) return;
    setIsRunningInference(true);
    try {
      const config: InferenceConfig = { residualTgt: residualContent, delta: 4 };
      const result = await runInference(config);
      setPredictionsContent(result.predictionsContent);
      setInferenceStats({ totalWords: result.totalWords, processedWords: result.totalWords });
      setInferenceComplete(true);
    } catch (err) {
      console.error("[inference] failed", err);
    } finally {
      setIsRunningInference(false);
    }
  }, [residualContent, isRunningInference, runInference]);

  const handleDownloadPredictions = useCallback(() => {
    triggerDownload(predictionsContent, `predictions_cycle${currentIteration}.tgt`);
  }, [predictionsContent, currentIteration]);

  // ── Cycle transitions ──────────────────────────────────────────────────

  const handleNewCycle = useCallback(() => {
    const nextIteration = currentIteration + 1;
    setCurrentIteration(nextIteration);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);
    setPendingCycleResult(null);
    setIncrementContent("");
    setResidualContent("");
    setEvaluationContent("");
    setIsRunningInference(false);
    setInferenceComplete(false);
    setInferenceStats(null);
    setPredictionsContent("");

    projectDB.saveProjectMeta({
      currentIteration: nextIteration,
      currentStage: "training",
    });
    goToStage("training");
    setAutoStartTraining(true);
  }, [goToStage, currentIteration, projectDB]);

  const handleStartOver = useCallback(async () => {
    setCurrentStage("ingestion");
    setCompletedStages([]);
    setModelConfigLocal(DEFAULT_MODEL_CONFIG);
    setCurrentIteration(1);
    cumulativeSelectSize.current = 0;
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);
    setAutoStartTraining(false);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    setTrainingResult(null);
    setPreviousResult(null);
    setPendingCycleResult(null);
    setIncrementContent("");
    setResidualContent("");
    setEvaluationContent("");
    setIsRunningInference(false);
    setInferenceComplete(false);
    setInferenceStats(null);
    setPredictionsContent("");

    await projectDB.clearAll();
    await projectDB.initProject();
    // Wipe the Pyodide VFS (crf.model + artifacts) from both memory and IDBFS
    wipeVfs().catch((err) => console.warn('[useTurtleshell] VFS wipe failed:', err));
    hasRestored.current = true;
  }, [projectDB, wipeVfs]);

  // ── Return (same shape — no breaking changes to consumers) ─────────────

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
    indexedDBReady,

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
    trainingSteps,
    currentIteration,
    totalIterations: modelConfig.iterations,
    isTrainingComplete,
    handleStartTraining,

    // Annotation
    annotationWords,
    currentWordIndex,
    totalAnnotationWords: annotationWords.length,
    handleUpdateBoundaries,
    handleSubmitAnnotations,
    handleSkipAnnotation,

    // Results
    trainingResult,
    previousResult,
    cycleHistory,
    incrementContent,
    residualContent,
    evaluationContent,
    handleDownloadIncrement,
    handleDownloadResidual,
    handleDownloadEvaluation,
    handleNewCycle,
    handleStartOver,

    // Inference
    isRunningInference,
    inferenceComplete,
    inferenceStats,
    handleRunInference,
    handleDownloadPredictions,
  };
}