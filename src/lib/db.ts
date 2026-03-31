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
let currentLanguage: string | undefined = undefined;
let lastSentLanguage: string | undefined = undefined;
let messageIdCounter = 1;

// Pyodide readiness state and listeners
let pyodideReady = false;
const pyodideListeners: Array<(ready: boolean) => void> = [];

export function setPyodideWorker(worker: Worker) {
  pyodide = worker;
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


export function setLanguage(language: string) {
  const norm = (language || '').trim();
  currentLanguage = norm;
  if (!pyodide) return;
  // Only post if language changed since last send to avoid duplicates
  if (lastSentLanguage === norm) return;
  lastSentLanguage = norm;
  (pyodide as Worker).postMessage({ type: "SET_LANGUAGE", language: norm });
}

async function sendMessageToWorker(message: any): Promise<any> {
  if (!pyodide) throw new Error("Pyodide worker not set");
  const w = pyodide as Worker;
  // Language should be set explicitly via `setLanguage()` to avoid duplicates.
  return new Promise((resolve, reject) => {
    // Map request types to expected worker response event types
    const expectedMap: Record<string, string> = {
      IMPORT_FILES: 'FILES_IMPORTED',
      LOAD_FILES: 'FILES_LOADED',
      READ_FILE: 'FILE_READ',
      DELETE_FILE: 'FILE_DELETED',
      SAVE_FILE: 'FILE_SAVED',
      CLEAR_FILES: 'FILES_CLEARED',
      SYNC_VFS: 'VFS_SYNCED',
      WIPE_VFS: 'VFS_WIPED',
      INIT: 'INIT_DONE',
      DOWNLOAD_SNAPSHOT: 'SNAPSHOT_DOWNLOADED',
      READ_SNAPSHOT: 'SNAPSHOT_READ',
    };
    const expected = expectedMap[message.type];

    const id = messageIdCounter++;
    message.id = id;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleMessage = (event: MessageEvent) => {
      const t = event.data?.type as string | undefined;
      const msgId = event.data?.id;
      if (msgId !== id) return; // Only handle messages with matching id

      // Generic error responses (FILE_*_ERROR, *_ERROR)
      if (t && t.endsWith('_ERROR')) {
        if (timeout) { clearTimeout(timeout); timeout = null; }
        w.removeEventListener('message', handleMessage);
        const errMsg = event.data.error || event.data.message || JSON.stringify(event.data);
        console.warn('[db] sendMessageToWorker ERROR', t, errMsg);
        reject(new Error(errMsg));
        return;
      }

      // If we have a mapped expected type, resolve on match
      if (expected && t === expected) {
        if (timeout) { clearTimeout(timeout); timeout = null; }
        w.removeEventListener('message', handleMessage);
        resolve(event.data.payload);
        return;
      }

      // Fallback: allow FILE_READ for READ_FILE
      if (message.type === 'READ_FILE' && t === 'FILE_READ') {
        if (timeout) { clearTimeout(timeout); timeout = null; }
        w.removeEventListener('message', handleMessage);
        resolve(event.data.payload);
        return;
      }
    };
    w.addEventListener('message', handleMessage);
    // If this message needs a language context, ensure worker has it first
    const needsLanguage = ['IMPORT_FILES','LOAD_FILES','READ_FILE','SAVE_FILE','DELETE_FILE','CLEAR_FILES'] as const;
    if (currentLanguage && lastSentLanguage !== currentLanguage && needsLanguage.includes(message.type)) {
      w.postMessage({ type: 'SET_LANGUAGE', language: currentLanguage, id });
      lastSentLanguage = currentLanguage;
    }
    w.postMessage(message);
    timeout = setTimeout(() => {
      w.removeEventListener('message', handleMessage);
      console.warn('[db] sendMessageToWorker TIMEOUT', { message });
      reject(new Error('Worker response timeout'));
    }, 15000);
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
  async importFile(fileName: string, fileContent: string | Uint8Array) {
    if (currentLanguage) setLanguage(currentLanguage);
    await sendMessageToWorker({ type: "IMPORT_FILES", fileName, fileContent });
    return await this.loadFiles();
  }
  async deleteFile(filePath: string) {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "DELETE_FILE", filePath });
  }
  async saveFile(filePath: string, fileContent: string) {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "SAVE_FILE", filePath, fileContent });
  }
  async loadFiles() {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "LOAD_FILES" });
  }
  async readFile(filePath: string) {
    if (currentLanguage) setLanguage(currentLanguage);
    try {
      return await sendMessageToWorker({ type: "READ_FILE", filePath });
    } catch (err: any) {
      // Robust error handling for file not found
      const msg = err?.message || err?.toString() || '';
      if (msg.includes('File not found') || msg.includes('ENOENT')) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw err;
    }
  }
  async downloadSnapshot() {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "DOWNLOAD_SNAPSHOT" });
  }
  async readSnapshot(snapshotJson: string) {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "READ_SNAPSHOT", snapshotJson });
  }

  async clearFiles(directory?: string) {
    if (currentLanguage) setLanguage(currentLanguage);
    return await sendMessageToWorker({ type: "CLEAR_FILES", directory });
  }
}();