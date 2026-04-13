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
  { id: "config", label: "Model Configuration", shortLabel: "Config" },
  { id: "ingestion", label: "Dataset Ingestion", shortLabel: "Upload" },
  { id: "training", label: "Training Progress", shortLabel: "Training" },
  { id: "results", label: "Results & Export", shortLabel: "Results" },
  { id: "annotation", label: "Annotation Workspace", shortLabel: "Annotate" },
];

// --- Files ---

export type FileRole = "annotated" | "unannotated";

export type ValidationStatus = "pending" | "valid" | "invalid";

export interface fileData {
  fileName: string;
  fileSize: number;
  fileContent: string;
  fileRole: FileRole | null;
  validationStatus: ValidationStatus;
  createdAt: Date;
  filePath: string;
  fileType: string;
}

// --- Model Configuration ---

export type QueryStrategy = "uncertainty" | "random" ;

export interface ModelConfig {
  targetLanguage: string;
  incrementSize: number;
  /**
   * Random seed for train/test/select splits. Range: [0, 4_294_967_295].
   * null = generate a fresh random seed each cycle (non-reproducible).
   */
  randomSeed: number | null;
  queryStrategy: QueryStrategy;
  /**
   * Delimiter character used to separate morphemes in annotated files.
   * Common values: "!" "|" "+" "-"
   */
  delimiter: string;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  incrementSize: 100,
  randomSeed: null,
  queryStrategy: "uncertainty",
  targetLanguage: "English",
  delimiter: "!",
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
  confirmed?: boolean;
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
  /** File path of the annotated training file */
  annotatedFile: string;
  /** File path of the unannotated evaluation file */
  unannotatedFile: string;
  /** Target language for the model */
  targetLanguage: string;
  /** How many low-confidence words to pull into the increment */
  incrementSize: number;
  /** Max CRF training iterations */
  maxIterations: number;
  /** Context window size for character features */
  delta: number;
  /** Cumulative words selected in prior cycles (0 on first run) */
  selectSize: number;
  /**
   * Resolved random seed for this cycle's train/test split.
   * Always a concrete number by the time it hits the worker.
   */
  randomSeed: number;
  /** Active learning query strategy forwarded to the Python selection step */
  queryStrategy: QueryStrategy;
  /** VFS working directory — default '/tmp/turtleshell' */
  workDir?: string;
  /**
   * Character used to separate morphemes in annotated files, e.g. "!" in "un!happy".
   * Passed through to Python so the CRF pipeline parses boundaries correctly.
   */
  delimiter: string;
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
  /** increment.tgt file content — words selected for annotation this cycle */
  incrementContent: string;
  /** residual.tgt file content — remaining unlabeled pool after this cycle */
  residualContent: string;
  /** Evaluation report — per-word predictions with P/R/F1 summary header */
  evaluationContent: string;
}

/** Config for running the trained model over all residual words (no retraining). */
export interface InferenceConfig {
  /** residual.tgt content — the remaining unannotated pool */
  residualTgt: string;
  /** Context window size for character features (default 4) */
  delta?: number;
  /** VFS working directory where crf.model was saved (default /tmp/turtleshell) */
  workDir?: string;
  /** Target language to locate the saved model */
  targetLanguage?: string;
}

/** Result from a full-corpus inference pass. */
export interface InferenceResult {
  /** Full .tgt file content with predicted segmentations for every residual word */
  predictionsContent: string;
  /** Number of words that were segmented */
  totalWords: number;
}