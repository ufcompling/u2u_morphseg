import { importFiles } from "../services/database/helpers/importFiles";
import { deleteFile } from "../services/database/helpers/deleteFile";
import { saveFile } from "../services/database/helpers/saveFile";
import { loadFiles } from "../services/database/helpers/loadFiles";
import { readFile } from "../services/database/helpers/readFile";
import { clearFiles } from "../services/database/helpers/clearFiles";
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
  name: string;
  size: number;
  content: string;
  role: FileRole | null;
  validationStatus: ValidationStatus;
  uploadedAt: number; // unix ms
}

/** Snapshot of a single completed AL cycle. */
export interface CycleRow {
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
  cycleNumber: number;
  wordId: string;
  word: string;
  confidence: number;
  boundaries: MorphemeBoundary[];
  /** True once the user has confirmed this word's boundaries. */
  confirmed: boolean;
}

// ── Database class ───────────────────────────────────────────────────────────


export const db = new class {
  async importFiles(pyodide: any, files: FileList) {
    return await importFiles(pyodide, files);
  }
  async deleteFile(pyodide: any, filePath: string) {
    return await deleteFile(pyodide, filePath);
  }
  async saveFile(pyodide: any, fileName: string, fileContent: string) {
    return await saveFile(pyodide, fileName, fileContent);
  }
  async loadFiles(pyodide: any) {
    return await loadFiles(pyodide);
  }
  async readFile(pyodide: any, filePath: string) {
    return await readFile(pyodide, filePath);
  }
  async clearFiles(pyodide: any, directory?: string) {
    return await clearFiles(pyodide, directory);
  }
}();