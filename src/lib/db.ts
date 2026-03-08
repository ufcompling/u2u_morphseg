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

// Pyodide readiness state and listeners
let pyodideReady = false;
const pyodideListeners: Array<(ready: boolean) => void> = [];

export function setPyodideWorker(worker: Worker) {
  pyodide = worker;
  // Listen for PYODIDE_READY or INIT_DONE message from worker
  pyodide.addEventListener("message", (event: MessageEvent) => {
    if (
      event.data &&
      (event.data.type === "PYODIDE_READY" || event.data.type === "INIT_DONE")
    ) {
      if (!pyodideReady) {
        pyodideReady = true;
        pyodideListeners.forEach((cb) => cb(true));
      }
    }
  });
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
  get pyodideReady() {
    return pyodideReady;
  }
  subPyodideReady(cb: (ready: boolean) => void) {
    pyodideListeners.push(cb);
    // Immediately call with current state
    cb(pyodideReady);
    // Return unsubscribe function
    return () => {
      const idx = pyodideListeners.indexOf(cb);
      if (idx !== -1) pyodideListeners.splice(idx, 1);
    };
  }
  async importFiles(fileName: string, fileContent: string | Uint8Array) {
    console.log('[db] Sending IMPORT_FILES to worker', { fileName, fileContent });
    await sendMessageToWorker({ type: "IMPORT_FILES", fileName, fileContent });
    return await this.loadFiles();
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