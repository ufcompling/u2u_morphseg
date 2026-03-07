// Removed unused import
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

let pyodide: Worker | undefined;
export function setPyodideWorker(worker: Worker) {
  pyodide = worker;
}

async function sendMessageToWorker(message: any): Promise<any> {
  if (!pyodide) throw new Error("Pyodide worker not set");
  return new Promise((resolve) => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === `${message.type}_RESPONSE`) {
        pyodide!.removeEventListener("message", handleMessage);
        resolve(event.data.payload);
      }
    };
    pyodide!.addEventListener("message", handleMessage);
    pyodide!.postMessage(message);
  });
}

export const db = new class {
  async importFiles(files: FileList) {
    return await sendMessageToWorker({ type: "IMPORT_FILES", files });
  }
  async deleteFile(filePath: string) {
    return await sendMessageToWorker({ type: "DELETE_FILE", filePath });
  }
  async saveFile(fileName: string, fileContent: string) {
    return await sendMessageToWorker({ type: "SAVE_FILE", fileName, fileContent });
  }
  async loadFiles() {
    return await sendMessageToWorker({ type: "LOAD_FILES" });
  }
  async readFile(filePath: string) {
    return await sendMessageToWorker({ type: "READ_FILE", filePath });
  }
  async clearFiles(directory?: string) {
    return await sendMessageToWorker({ type: "CLEAR_FILES", directory });
  }
}();