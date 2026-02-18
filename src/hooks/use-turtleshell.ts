/**
 * use-turtleshell.ts
 * Custom hook managing all TurtleShell workflow state.
 *
 * Centralizes state for:
 * - Workflow navigation (stages, completion tracking)
 * - File management (upload, role assignment, validation)
 * - Model configuration (AL parameters)
 * - Training pipeline (steps, iteration tracking) — now backed by Pyodide worker
 * - Annotation workspace (word boundaries, user edits)
 * - Results & metrics (F1/P/R, cycle history)
 *
 * Backend integration points marked with TODO [BACKEND] for work not yet done.
 */

"use client";

import { useState, useCallback, useRef } from "react";
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
  DEFAULT_MODEL_CONFIG,
  INITIAL_TRAINING_STEPS,
} from "../lib/types";
import { usePyodideWorker } from "./usePyodideWorker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find the file assigned to a given role, return its content or empty string. */
function getFileContent(files: StoredFile[], role: FileRole): string {
  return files.find((f) => f.role === role)?.content ?? "";
}

/**
 * Derive the .src content from a .tgt file (character-space representation).
 * .tgt format: "r u n ! n i n g\n"  →  .src: "r u n n i n g\n"
 * The src file strips the morpheme boundary markers ('!') so each line is just
 * the space-separated characters of the word.
 */
function tgtToSrc(tgt: string): string {
  return tgt
    .split("\n")
    .map((line) => line.replace(/!/g, "").replace(/\s+/g, " ").trim())
    .join("\n");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTurtleshell() {
  // ── Workflow navigation ───────────────────────────────────────────────────

  const [currentStage, setCurrentStage] = useState<WorkflowStage>("ingestion");
  const [completedStages, setCompletedStages] = useState<WorkflowStage[]>([]);

  const goToStage = useCallback(
    (stage: WorkflowStage) => {
      if (!completedStages.includes(currentStage)) {
        setCompletedStages((prev) => [...prev, currentStage]);
      }
      setCurrentStage(stage);
    },
    [currentStage, completedStages]
  );

  // ── Backend status ─────────────────────────────────────────────────────────

  const { pyodideReady, pyodideLoading, pyodideError, runCycle } = usePyodideWorker();
  // TODO [BACKEND]: surface pyodideLoading and pyodideError in the UI (loading overlay / toast)
  const indexedDBReady = false; // TODO [BACKEND]: wire up Dexie.js

  // ── File management ────────────────────────────────────────────────────────

  const [files, setFiles] = useState<StoredFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    setIsUploading(true);

    const readers = Array.from(fileList).map(
      (file) =>
        new Promise<StoredFile>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

    Promise.all(readers).then((newFiles) => {
      setFiles((prev) => [...prev, ...newFiles]);
      // TODO [BACKEND]: Persist to IndexedDB via Dexie.js
      setIsUploading(false);
    });
  }, []);

  const handleAssignRole = useCallback((fileId: string, role: FileRole) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, role } : f))
    );
    // TODO [BACKEND]: Update role in IndexedDB
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    // TODO [BACKEND]: Delete from IndexedDB
  }, []);

  // ── Model configuration ────────────────────────────────────────────────────

  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);

  // ── Training ───────────────────────────────────────────────────────────────

  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>(INITIAL_TRAINING_STEPS);
  const [currentIteration, setCurrentIteration] = useState(1);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);

  // Tracks cumulative words selected across cycles for the Python script's
  // select_size param (controls which prev-iteration files to chain from).
  const cumulativeSelectSize = useRef(0);

  /**
   * Mark a training step as active or complete in the step list.
   * Called by the worker's onStepProgress callback.
   */
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

  const handleStartTraining = useCallback(async () => {
    goToStage("training");
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);

    const trainTgt = getFileContent(files, "annotated");
    const testTgt  = getFileContent(files, "evaluation");
    const selectTgt = getFileContent(files, "unannotated");

    // Derive .src from .tgt — Python needs both but the user only uploads .tgt
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
      setAnnotationWords(result.incrementWords);
      setCurrentWordIndex(0);
      setIsTrainingComplete(true);

      // Stash result so handleSubmitAnnotations can use real metrics
      setPendingCycleResult({
        precision: result.precision,
        recall: result.recall,
        f1: result.f1,
        totalWords: (selectTgt.split("\n").filter(Boolean).length + trainTgt.split("\n").filter(Boolean).length),
        annotatedCount: cumulativeSelectSize.current,
        iterationNumber: currentIteration,
      });
    } catch (err) {
      console.error("[training] cycle failed", err);
      // Mark any active step as errored so the UI doesn't hang
      setTrainingSteps((prev) =>
        prev.map((s) =>
          s.status === "active" ? { ...s, status: "error", detail: String(err) } : s
        )
      );
    }
  }, [goToStage, files, modelConfig, runCycle, updateStep, currentIteration]);

  // ── Results (declared before annotation for reference) ────────────────────

  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [previousResult, setPreviousResult] = useState<TrainingResult | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleSnapshot[]>([]);

  // Holds the real metrics from the last completed cycle until the user
  // submits their annotations, at which point it becomes the committed result.
  const [pendingCycleResult, setPendingCycleResult] = useState<TrainingResult | null>(null);

  // ── Annotation ─────────────────────────────────────────────────────────────

  const [annotationWords, setAnnotationWords] = useState<AnnotationWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const handleUpdateBoundaries = useCallback(
    (wordId: string, boundaryIndices: number[]) => {
      setAnnotationWords((prev) =>
        prev.map((w) =>
          w.id === wordId
            ? { ...w, boundaries: boundaryIndices.map((index) => ({ index })) }
            : w
        )
      );
      // TODO [BACKEND]: Persist updated annotation to IndexedDB
    },
    []
  );

  const handleSubmitAnnotations = useCallback(() => {
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
    setCycleHistory((prev) => [
      ...prev,
      {
        iteration: result.iterationNumber,
        precision: result.precision,
        recall: result.recall,
        f1: result.f1,
        annotatedCount: result.annotatedCount,
      },
    ]);

    // TODO [BACKEND]: Persist submitted annotations + metrics to IndexedDB
    goToStage("results");
  }, [goToStage, pendingCycleResult, trainingResult, currentIteration, annotationWords.length]);

  const handleSkipAnnotation = useCallback(() => {
    goToStage("results");
  }, [goToStage]);

  // ── Results actions ────────────────────────────────────────────────────────

  const handleDownloadIncrement = useCallback(() => {
    // TODO [BACKEND]: Read increment.tgt from VFS / IndexedDB and trigger download
  }, []);

  const handleDownloadResidual = useCallback(() => {
    // TODO [BACKEND]: Read residual.tgt from VFS / IndexedDB and trigger download
  }, []);

  const handleDownloadEvaluation = useCallback(() => {
    // TODO [BACKEND]: Read eval.txt from VFS and trigger download
  }, []);

  const handleNewCycle = useCallback(() => {
    setCurrentIteration((prev) => prev + 1);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);
    setPendingCycleResult(null);
    goToStage("training");
    // handleStartTraining is not called here directly — the training stage
    // mounts and calls it via its own useEffect / button, keeping the flow
    // consistent with the first cycle. If auto-start is preferred, the
    // training-progress component can invoke handleStartTraining on mount.
  }, [goToStage]);

  const handleStartOver = useCallback(() => {
    setFiles([]);
    setModelConfig(DEFAULT_MODEL_CONFIG);
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setCurrentIteration(1);
    setIsTrainingComplete(false);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    setTrainingResult(null);
    setPreviousResult(null);
    setPendingCycleResult(null);
    setCycleHistory([]);
    setCompletedStages([]);
    setCurrentStage("ingestion");
    cumulativeSelectSize.current = 0;
    // TODO [BACKEND]: Wipe IndexedDB and clear VFS via worker message
  }, []);

  // ─── Return ──────────────────────────────────────────────────────────────────

  return {
    // Workflow
    currentStage,
    completedStages,
    goToStage,

    // Backend status
    pyodideReady,
    pyodideLoading,
    pyodideError,
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
    handleDownloadIncrement,
    handleDownloadResidual,
    handleDownloadEvaluation,
    handleNewCycle,
    handleStartOver,
  };
}