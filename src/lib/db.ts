import Dexie, { type Table } from "dexie";
import type {
  WorkflowStage,
  ModelConfig,
  FileRole,
  ValidationStatus,
  MorphemeBoundary,
} from "./types";

// ── Table row types ──────────────────────────────────────────────────────────

/** Singleton project row. Always id=1 for single-project model. */
export interface ProjectRow {
  id: number; // always 1
  currentStage: WorkflowStage;
  modelConfig: ModelConfig;
  currentIteration: number;
  /** Cumulative words selected across all cycles (drives selectSize param). */
  cumulativeSelectSize: number;
  createdAt: number; // unix ms
  updatedAt: number;
}

/** Uploaded file stored as a text blob with role metadata. */
export interface FileRow {
  id?: number; // auto-increment
  name: string;
  size: number;
  content: string;
  role: FileRole | null;
  validationStatus: ValidationStatus;
  uploadedAt: number; // unix ms
}

/** Snapshot of a single completed AL cycle. */
export interface CycleRow {
  id?: number;
  cycleNumber: number;
  precision: number;
  recall: number;
  f1: number;
  annotatedCount: number;
  incrementContent: string;
  residualContent: string;
  evaluationContent: string;
  completedAt: number;
}

/** Individual word annotation within a cycle. */
export interface AnnotationRow {
  id?: number;
  cycleNumber: number;
  wordId: string;
  word: string;
  confidence: number;
  boundaries: MorphemeBoundary[];
  /** True once the user has confirmed this word's boundaries. */
  confirmed: boolean;
}

// ── Database class ───────────────────────────────────────────────────────────

class TurtleShellDB extends Dexie {
  project!: Table<ProjectRow, number>;
  files!: Table<FileRow, number>;
  cycles!: Table<CycleRow, number>;
  annotations!: Table<AnnotationRow, number>;

  constructor() {
    super("TurtleShellDB");

    this.version(1).stores({
      // Singleton — only ever one row with id=1
      project: "id",
      // Auto-increment PK, indexed on role for filtered queries
      files: "++id, role",
      // Auto-increment PK, unique on cycleNumber for lookup
      cycles: "++id, &cycleNumber",
      // Auto-increment PK, compound index for "get all annotations in cycle N"
      // plus [cycleNumber+wordId] uniqueness so we can upsert cleanly
      annotations: "++id, cycleNumber, [cycleNumber+wordId]",
    });
  }
}

export const db = new TurtleShellDB();