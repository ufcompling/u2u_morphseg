// ============================================================
// TurtleShell Types
// Centralized type definitions for the active learning workflow
// ============================================================

// --- Workflow ---

export type WorkflowStage =
  | "ingestion"
  | "config"
  | "training"
  | "annotation"
  | "results";

export const WORKFLOW_STAGES: {
  id: WorkflowStage;
  label: string;
  shortLabel: string;
}[] = [
  { id: "ingestion", label: "Dataset Ingestion", shortLabel: "Upload" },
  { id: "config", label: "Model Configuration", shortLabel: "Config" },
  { id: "training", label: "Training Progress", shortLabel: "Training" },
  { id: "annotation", label: "Annotation Workspace", shortLabel: "Annotate" },
  { id: "results", label: "Results & Export", shortLabel: "Results" },
];

// --- Files ---

export type FileRole = "annotated" | "unannotated" | "evaluation";

export type ValidationStatus = "pending" | "valid" | "invalid";

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  content: string;
  role: FileRole | null;
  validationStatus: ValidationStatus;
  uploadedAt: Date;
}

// --- Model Configuration ---

export type QueryStrategy = "uncertainty" | "random" | "margin";

export interface ModelConfig {
  targetLanguage: string;
  incrementSize: number;
  iterations: number;
  queryStrategy: QueryStrategy;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  incrementSize: 100,
  iterations: 5,
  queryStrategy: "uncertainty",
  targetLanguage: "English"
};

// --- CRF Training Constants ---

/** Maximum iterations for CRF optimization (L-BFGS convergence limit) */
export const CRF_MAX_ITERATIONS = 100;

/** Character context window radius for CRF features (chars left + right) */
export const CRF_FEATURE_DELTA = 4;

// --- Training ---

export type TrainingStepStatus = "pending" | "active" | "complete" | "error";

export interface TrainingStep {
  id: string;
  label: string;
  status: TrainingStepStatus;
  detail?: string;
}

export const INITIAL_TRAINING_STEPS: TrainingStep[] = [
  { id: "init", label: "Initializing Environment", status: "pending" },
  { id: "train", label: "Training CRF Model", status: "pending" },
  { id: "predict", label: "Predicting Segmentations", status: "pending" },
  { id: "select", label: "Selecting Low Confidence Samples", status: "pending" },
];

// --- Annotation ---

export interface MorphemeBoundary {
  /** Index of the character after which a boundary exists */
  index: number;
}

export interface AnnotationWord {
  id: string;
  word: string;
  boundaries: MorphemeBoundary[];
  confidence: number;
}

// --- Results ---

export interface TrainingResult {
  precision: number;
  recall: number;
  f1: number;
  totalWords: number;
  annotatedCount: number;
  iterationNumber: number;
}

/** History entry for cycle-over-cycle comparison */
export interface CycleSnapshot {
  iteration: number;
  precision: number;
  recall: number;
  f1: number;
  annotatedCount: number;
}

// --- Pyodide Worker Bridge ---

/**
 * Payload sent from the main thread to the worker for each AL cycle.
 * File content is passed as raw strings so Python can write them to VFS.
 */
export interface TrainingCycleConfig {
  /** Content of the annotated training .tgt file */
  trainTgt: string;
  /** Content of the evaluation .tgt file */
  testTgt: string;
  /** Content of the unannotated pool .tgt file (predicted morphemes) */
  selectTgt: string;
  /** Content of the unannotated pool .src file (character-space words) */
  selectSrc: string;
  /** How many low-confidence words to pull into the increment */
  incrementSize: number;
  /** Max CRF training iterations */
  maxIterations: number;
  /** Context window size for character features */
  delta: number;
  /** Cumulative words selected in prior cycles (0 on first run) */
  selectSize: number;
  /** VFS working directory â€” default '/tmp/turtleshell' */
  workDir?: string;
}

/** Result returned from the worker after a successful cycle. */
export interface TrainingCycleResult {
  precision: number;        // 0-1 range (normalized from Python's 0-100)
  recall: number;
  f1: number;
  /** Low-confidence words queued for user annotation */
  incrementWords: AnnotationWord[];
  /** Number of words remaining in the unlabeled pool */
  residualCount: number;
  /** increment.tgt file content â€” words selected for annotation this cycle */
  incrementContent: string;
  /** residual.tgt file content â€” remaining unlabeled pool after this cycle */
  residualContent: string;
  /** Evaluation report â€” per-word predictions with P/R/F1 summary header */
  evaluationContent: string;
}

/** Config for running the trained model over all residual words (no retraining). */
export interface InferenceConfig {
  /** residual.tgt content â€” the remaining unannotated pool */
  residualTgt: string;
  /** Context window size for character features (default 4) */
  delta?: number;
  /** VFS working directory where crf.model was saved (default /tmp/turtleshell) */
  workDir?: string;
}

/** Result from a full-corpus inference pass. */
export interface InferenceResult {
  /** Full .tgt file content with predicted segmentations for every residual word */
  predictionsContent: string;
  /** Number of words that were segmented */
  totalWords: number;
}