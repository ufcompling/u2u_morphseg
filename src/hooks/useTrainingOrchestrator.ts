/**
 * useTrainingOrchestrator.ts
 * Location: src/hooks/useTrainingOrchestrator.ts
 *
 * Purpose:
 *   Manages the CRF training cycle lifecycle: starting a cycle, tracking
 *   step progress, collecting results, and running full-corpus inference.
 *   Isolated from the rest of the workflow so new model types or query
 *   strategies can be added without touching annotation or navigation logic.
 *
 */

import { useState, useCallback } from "react";
import type {
  fileData,
  ModelConfig,
  TrainingStep,
  TrainingResult,
  TrainingCycleConfig,
  TrainingCycleResult,
  AnnotationWord,
  InferenceConfig,
  InferenceResult,
} from "../lib/types";
import { INITIAL_TRAINING_STEPS, CRF_MAX_ITERATIONS, CRF_FEATURE_DELTA } from "../lib/types";
import { getFileContent, tgtToSrc, getFileByRole } from "../lib/format-utils";
import { db } from "../lib/db";
import { log } from "../lib/logger";
import type { StepProgressCallback } from "./usePyodideWorker";

const logger = log('training');

// ── Input dependencies (provided by compositor) ─────────────────────────────

export interface TrainingOrchestratorDeps {
  /** Current uploaded files with role assignments */
  files: fileData[];
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

    // remove when model accesses file data directly
    for (const f of files) {
      // Skip known binary artifacts that the UI shouldn't try to decode as text
      if (f.filePath && (f.filePath.endsWith('.model') || f.fileName?.toLowerCase().endsWith('.whl') || f.fileName?.toLowerCase().endsWith('.wasm'))) {
        console.debug('[useTrainingOrchestrator] skipping binary artifact during pre-populate', f.filePath);
        continue;
      }
      if ((!f.fileContent || f.fileContent.length === 0) && f.filePath) {
        try {
          const res = await db.readFile(f.filePath);
          f.fileContent = res.fileContent;
          f.fileType = res.fileType;
          console.log('[useTrainingOrchestrator] populated file', { filePath: f.filePath, length: f.fileContent?.length, fileType: f.fileType });
        } catch (err) {
          logger.warn(`readFile failed for ${f.filePath}`, err);
        }
      }
    }

    const trainTgt = getFileContent(files, "annotated");
    const testTgt = getFileContent(files, "evaluation");
    let selectTgt = getFileContent(files, "unannotated");
    // If in-memory unannotated content looks empty or tiny, re-read from DB
    const unannotatedFile = getFileByRole(files, "unannotated");
    if ((selectTgt ?? "").split("\n").filter(Boolean).length < 2 && unannotatedFile?.filePath) {
      try {
        const res = await db.readFile(unannotatedFile.filePath);
        selectTgt = res.fileContent;
        console.debug('[useTrainingOrchestrator] refreshed unannotated file from DB', { filePath: unannotatedFile.filePath, length: selectTgt?.length });
      } catch (err) {
        logger.warn(`Failed to refresh unannotated file ${unannotatedFile.filePath}`, err);
      }
    }
    const selectSrc = tgtToSrc(selectTgt);

    // Diagnostics: log counts and abort early if unannotated pool is empty
    const trainCount = (trainTgt ?? "").split("\n").filter(Boolean).length;
    const testCount = (testTgt ?? "").split("\n").filter(Boolean).length;
    const selectCount = (selectTgt ?? "").split("\n").filter(Boolean).length;
    console.debug('[training] file counts', { trainCount, testCount, selectCount });
    if (selectCount === 0) {
      console.warn('[training] Aborting: unannotated pool is empty');
      setTrainingSteps((prev) =>
        prev.map((s) => (s.id === 'select' ? { ...s, status: 'error', detail: 'Unannotated pool is empty' } : s))
      );
      return;
    }

    const cycleConfig: TrainingCycleConfig = {
      trainTgt,
      testTgt,
      selectTgt,
      selectSrc,
      incrementSize: modelConfig.incrementSize,
      maxIterations: CRF_MAX_ITERATIONS,
      delta: CRF_FEATURE_DELTA,
      selectSize: cumulativeSelectSize.current,
    };

    try {
      const result = await runCycle(cycleConfig, (stepId, done, detail) => {
        updateStep(stepId, done, detail);
      });

      // Debug: surface key parts of the cycle result to help diagnose empty increments
      console.debug('[useTrainingOrchestrator] cycle result summary', {
        incrementWordsLen: result.incrementWords?.length ?? 0,
        incrementContentLen: (result.incrementContent ?? '').length,
        residualCount: result.residualCount,
        sentIncrementSize: cycleConfig.incrementSize,
        sentSelectSize: cycleConfig.selectSize,
        selectPoolCount: selectCount,
      });

      cumulativeSelectSize.current += result.incrementWords.length;

      setIncrementWords(result.incrementWords);
      setIsTrainingComplete(true);
      setIncrementContent(result.incrementContent ?? "");
      setResidualContent(result.residualContent ?? "");
      setEvaluationContent(result.evaluationContent ?? "");

      const totalWords =
        (selectTgt ?? '').split("\n").filter(Boolean).length +
        (trainTgt ?? '').split("\n").filter(Boolean).length;

      setPendingCycleResult({
        precision: result.precision,
        recall: result.recall,
        f1: result.f1,
        totalWords,
        annotatedCount: cumulativeSelectSize.current,
        iterationNumber: currentIteration,
      });
    } catch (err) {
      logger.error(" cycle failed", err);
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
      const config: InferenceConfig = { residualTgt: residualContent, delta: CRF_FEATURE_DELTA };
      const result = await runInference(config);
      setPredictionsContent(result.predictionsContent);
      setInferenceStats({ totalWords: result.totalWords, processedWords: result.totalWords });
      setInferenceComplete(true);
    } catch (err) {
      logger.error(" failed", err);
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