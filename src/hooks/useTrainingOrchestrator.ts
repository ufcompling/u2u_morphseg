import { useState, useCallback } from "react";
import type {
  StoredFile,
  ModelConfig,
  TrainingStep,
  TrainingResult,
  TrainingCycleConfig,
  TrainingCycleResult,
  AnnotationWord,
  InferenceConfig,
  InferenceResult,
} from "../lib/types";
import { INITIAL_TRAINING_STEPS } from "../lib/types";
import { getFileContent, tgtToSrc } from "../lib/format-utils";
import type { StepProgressCallback } from "./usePyodideWorker";

// ── Input dependencies (provided by compositor) ─────────────────────────────

export interface TrainingOrchestratorDeps {
  /** Current uploaded files with role assignments */
  files: StoredFile[];
  modelConfig: ModelConfig;
  currentIteration: number;
  /** Running total of words selected across all cycles */
  cumulativeSelectSize: React.MutableRefObject<number>;
  /** Pyodide worker cycle runner */
  runCycle: (
    config: TrainingCycleConfig,
    onStepProgress: StepProgressCallback
  ) => Promise<TrainingCycleResult>;
  /** Pyodide worker inference runner */
  runInference: (config: InferenceConfig) => Promise<InferenceResult>;
}

// ── Return shape ────────────────────────────────────────────────────────────

export interface TrainingOrchestratorReturn {
  trainingSteps: TrainingStep[];
  isTrainingComplete: boolean;
  pendingCycleResult: TrainingResult | null;

  /** Words selected for annotation by the latest cycle */
  incrementWords: AnnotationWord[];
  /** Raw file content from the latest cycle */
  incrementContent: string;
  residualContent: string;
  evaluationContent: string;

  /** Kick off a training cycle using current files + config */
  startTraining: () => Promise<void>;

  /** Full-corpus inference state */
  isRunningInference: boolean;
  inferenceComplete: boolean;
  inferenceStats: { totalWords: number; processedWords: number } | null;
  predictionsContent: string;
  startInference: () => Promise<void>;

  /** Reset all training state for a new cycle or fresh start */
  resetTrainingState: () => void;
  resetInferenceState: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTrainingOrchestrator(deps: TrainingOrchestratorDeps): TrainingOrchestratorReturn {
  const { files, modelConfig, currentIteration, cumulativeSelectSize, runCycle, runInference } = deps;

  // ── Training step progress ──────────────────────────────────────────────
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>(INITIAL_TRAINING_STEPS);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);
  const [pendingCycleResult, setPendingCycleResult] = useState<TrainingResult | null>(null);

  // ── Cycle output ────────────────────────────────────────────────────────
  const [incrementWords, setIncrementWords] = useState<AnnotationWord[]>([]);
  const [incrementContent, setIncrementContent] = useState("");
  const [residualContent, setResidualContent] = useState("");
  const [evaluationContent, setEvaluationContent] = useState("");

  // ── Inference state ─────────────────────────────────────────────────────
  const [isRunningInference, setIsRunningInference] = useState(false);
  const [inferenceComplete, setInferenceComplete] = useState(false);
  const [inferenceStats, setInferenceStats] = useState<{
    totalWords: number;
    processedWords: number;
  } | null>(null);
  const [predictionsContent, setPredictionsContent] = useState("");

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

  // ── Start training cycle ────────────────────────────────────────────────

  const startTraining = useCallback(async () => {
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);

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

      setIncrementWords(result.incrementWords);
      setIsTrainingComplete(true);
      setIncrementContent(result.incrementContent ?? "");
      setResidualContent(result.residualContent ?? "");
      setEvaluationContent(result.evaluationContent ?? "");

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
  }, [files, modelConfig, runCycle, updateStep, currentIteration, cumulativeSelectSize]);

  // ── Inference ───────────────────────────────────────────────────────────

  const startInference = useCallback(async () => {
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

  // ── Resets ──────────────────────────────────────────────────────────────

  const resetTrainingState = useCallback(() => {
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);
    setPendingCycleResult(null);
    setIncrementWords([]);
    setIncrementContent("");
    setResidualContent("");
    setEvaluationContent("");
  }, []);

  const resetInferenceState = useCallback(() => {
    setIsRunningInference(false);
    setInferenceComplete(false);
    setInferenceStats(null);
    setPredictionsContent("");
  }, []);

  return {
    trainingSteps,
    isTrainingComplete,
    pendingCycleResult,
    incrementWords,
    incrementContent,
    residualContent,
    evaluationContent,
    startTraining,
    isRunningInference,
    inferenceComplete,
    inferenceStats,
    predictionsContent,
    startInference,
    resetTrainingState,
    resetInferenceState,
  };
}