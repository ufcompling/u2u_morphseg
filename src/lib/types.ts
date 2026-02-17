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
  incrementSize: number;
  iterations: number;
  queryStrategy: QueryStrategy;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  incrementSize: 50,
  iterations: 5,
  queryStrategy: "uncertainty",
};

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
