"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  type WorkflowStage,
  type StoredFile,
  type FileRole,
  type ModelConfig,
  type TrainingStep,
  type AnnotationWord,
  type TrainingResult,
  type CycleSnapshot,
  DEFAULT_MODEL_CONFIG,
  INITIAL_TRAINING_STEPS,
} from "../lib/types";

const CYCLE_1_WORDS: AnnotationWord[] = [
  { id: "w1", word: "running", confidence: 0.42, boundaries: [{ index: 3 }] },
  { id: "w2", word: "unhappiness", confidence: 0.38, boundaries: [{ index: 2 }, { index: 7 }] },
  { id: "w3", word: "rethinking", confidence: 0.55, boundaries: [{ index: 2 }, { index: 7 }] },
  { id: "w4", word: "teachers", confidence: 0.61, boundaries: [{ index: 5 }] },
  { id: "w5", word: "unbreakable", confidence: 0.33, boundaries: [{ index: 2 }, { index: 7 }] },
];

const CYCLE_N_WORDS: AnnotationWord[] = [
  { id: "w1n", word: "preprocessing", confidence: 0.35, boundaries: [{ index: 2 }] },
  { id: "w2n", word: "unbelievable", confidence: 0.29, boundaries: [{ index: 1 }, { index: 7 }] },
  { id: "w3n", word: "misunderstanding", confidence: 0.41, boundaries: [{ index: 2 }, { index: 7 }] },
  { id: "w4n", word: "carefully", confidence: 0.52, boundaries: [{ index: 4 }] },
  { id: "w5n", word: "discontinuation", confidence: 0.27, boundaries: [{ index: 2 }, { index: 8 }] },
  { id: "w6n", word: "overreacting", confidence: 0.44, boundaries: [{ index: 3 }, { index: 5 }] },
  { id: "w7n", word: "thoughtfulness", confidence: 0.48, boundaries: [{ index: 6 }] },
];

export function useTurtleshell() {
  // Workflow navigation
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

  // Backend status
  // TODO [BACKEND]: Replace with actual initialization states
  const pyodideReady = false;
  const indexedDBReady = false;

  // File management
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
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, role } : f)));
    // TODO [BACKEND]: Update in IndexedDB
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    // TODO [BACKEND]: Delete from IndexedDB
  }, []);

  // Model configuration
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);

  // Training
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>(INITIAL_TRAINING_STEPS);
  const [currentIteration, setCurrentIteration] = useState(1);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);

  // stepIndex drives the simulation via useEffect below.
  // -1 = not running. 0-3 = currently processing that step.
  const [stepIndex, setStepIndex] = useState(-1);
  const pendingWordsRef = useRef<AnnotationWord[]>([]);

  // Results
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [previousResult, setPreviousResult] = useState<TrainingResult | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleSnapshot[]>([]);

  // Annotation
  const [annotationWords, setAnnotationWords] = useState<AnnotationWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // TODO [BACKEND]: Replace this effect with actual Pyodide CRF training calls.
  // Each time stepIndex changes to a valid index, this effect:
  //   1. Marks that step active immediately
  //   2. After 600ms marks it complete and advances to the next index
  // useEffect cleanup cancels the timer, so StrictMode's unmount/remount
  // cancels the first fire and only the remounted effect runs.
  useEffect(() => {
    if (stepIndex < 0) return;

    const stepIds = INITIAL_TRAINING_STEPS.map((s) => s.id);
    if (stepIndex >= stepIds.length) return;

    // Mark this step active
    setTrainingSteps((prev) =>
      prev.map((s) =>
        s.id === stepIds[stepIndex]
          ? { ...s, status: "active" as const, detail: "Running..." }
          : s
      )
    );

    const timer = setTimeout(() => {
      // Mark complete
      setTrainingSteps((prev) =>
        prev.map((s) =>
          s.id === stepIds[stepIndex]
            ? { ...s, status: "complete" as const, detail: "Done" }
            : s
        )
      );

      const next = stepIndex + 1;
      if (next < stepIds.length) {
        setStepIndex(next);
      } else {
        // Done
        setStepIndex(-1);
        setAnnotationWords(pendingWordsRef.current);
        setCurrentWordIndex(0);
        setIsTrainingComplete(true);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [stepIndex]);

  const startSimulation = useCallback((words: AnnotationWord[]) => {
    pendingWordsRef.current = words;
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setIsTrainingComplete(false);
    setStepIndex(0);
  }, []);

  const handleStartTraining = useCallback(() => {
    goToStage("training");
    startSimulation(CYCLE_1_WORDS);
  }, [goToStage, startSimulation]);

  const handleUpdateBoundaries = useCallback(
    (wordId: string, boundaryIndices: number[]) => {
      setAnnotationWords((prev) =>
        prev.map((w) =>
          w.id === wordId
            ? { ...w, boundaries: boundaryIndices.map((index) => ({ index })) }
            : w
        )
      );
      // TODO [BACKEND]: Persist to IndexedDB
    },
    []
  );

  const handleSubmitAnnotations = useCallback(() => {
    // TODO [BACKEND]: Save annotations, compute metrics
    const iteration = currentIteration;
    const basePrecision = 0.55 + iteration * 0.07 + (Math.random() * 0.04 - 0.02);
    const baseRecall = 0.50 + iteration * 0.06 + (Math.random() * 0.04 - 0.02);
    const precision = Math.min(basePrecision, 0.98);
    const recall = Math.min(baseRecall, 0.98);
    const f1 = (2 * precision * recall) / (precision + recall);

    const newResult: TrainingResult = {
      precision,
      recall,
      f1,
      totalWords: 1200 + iteration * 50,
      annotatedCount: 50 * iteration,
      iterationNumber: iteration,
    };

    setPreviousResult(trainingResult);
    setTrainingResult(newResult);
    setCycleHistory((prev) => [
      ...prev,
      { iteration, precision, recall, f1, annotatedCount: newResult.annotatedCount },
    ]);
    goToStage("results");
  }, [goToStage, currentIteration, trainingResult]);

  const handleSkipAnnotation = useCallback(() => {
    goToStage("results");
  }, [goToStage]);

  // Results actions
  const handleDownloadIncrement = useCallback(() => {
    // TODO [BACKEND]: Generate increment file download
  }, []);

  const handleDownloadResidual = useCallback(() => {
    // TODO [BACKEND]: Generate residual file download
  }, []);

  const handleDownloadEvaluation = useCallback(() => {
    // TODO [BACKEND]: Generate evaluation file download
  }, []);

  const handleNewCycle = useCallback(() => {
    setCurrentIteration((prev) => prev + 1);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    goToStage("training");
    startSimulation(CYCLE_N_WORDS);
  }, [goToStage, startSimulation]);

  const handleStartOver = useCallback(() => {
    setStepIndex(-1);
    setFiles([]);
    setModelConfig(DEFAULT_MODEL_CONFIG);
    setTrainingSteps(INITIAL_TRAINING_STEPS);
    setCurrentIteration(1);
    setIsTrainingComplete(false);
    setAnnotationWords([]);
    setCurrentWordIndex(0);
    setTrainingResult(null);
    setPreviousResult(null);
    setCycleHistory([]);
    setCompletedStages([]);
    setCurrentStage("ingestion");
    // TODO [BACKEND]: Clear IndexedDB
  }, []);

  return {
    // Workflow
    currentStage,
    completedStages,
    goToStage,

    // Status
    pyodideReady,
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