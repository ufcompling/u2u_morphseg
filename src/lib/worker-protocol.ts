/**
 * worker-protocol.ts
 * Location: src/lib/worker-protocol.ts
 *
 * Purpose:
 *   Shared message type definitions for the Pyodide Web Worker protocol.
 *   Both the worker (pyodide.worker.ts) and the hook (usePyodideWorker.ts)
 *   import from here so there's a single source of truth for message shapes.
 *
 *   NOTE: This file must remain free of DOM/React imports so the worker
 *   (which runs in a non-DOM context) can use it safely via type-only imports.
 *
 * Dependencies: types.ts (type-only)
 */

import type {
  TrainingCycleConfig,
  TrainingCycleResult,
  InferenceResult,
} from "./types";

// ── Messages: Main Thread → Worker ────────────────────────────────────────────

export type WorkerInMessage =
  | { id: number; type: "INIT" }
  | { id: number; type: "RUN_CYCLE"; payload: TrainingCycleConfig }
  | { id: number; type: "RUN_INFERENCE"; payload: { residualTgt: string; delta?: number; workDir?: string } }
  | { id: number; type: "SYNC_VFS" }
  | { id: number; type: "WIPE_VFS" }
  | { id: number; type: "IMPORT_FILES"; fileName: string, fileContent: string | Uint8Array }
  | { id: number; type: "LOAD_FILES" }
  | { id: number; type: "READ_FILE"; filePath: string }
  | { id: number; type: "DELETE_FILE"; filePath: string }
  | { id: number; type: "SAVE_FILE"; filePath: string; fileContent: string }
  | { id: number; type: "CLEAR_FILES"; directory?: string }
  | { id: number; type: "DOWNLOAD_SNAPSHOT" }
  | { id: number; type: "READ_SNAPSHOT"; snapshotJson: string }
  | { id: number; type: "SET_LANGUAGE"; language: string };


// ── Messages: Worker → Main Thread ────────────────────────────────────────────

export type WorkerOutMessage =
  | { id: number; type: "INIT_PROGRESS"; step: string }
  | { id: number; type: "INIT_DONE"; modelExists: boolean }
  | { id: number; type: "INIT_ERROR"; error: string }
  | { id: number; type: "STEP_START"; stepId: string }
  | { id: number; type: "STEP_DONE"; stepId: string; detail?: string }
  | { id: number; type: "CYCLE_DONE"; result: TrainingCycleResult }
  | { id: number; type: "CYCLE_RAW"; payload: string }
  | { id: number; type: "CYCLE_ERROR"; error: string }
  | { id: number; type: "INFERENCE_DONE"; result: InferenceResult }
  | { id: number; type: "INFERENCE_ERROR"; error: string }
  | { id: number; type: "VFS_SYNCED" }
  | { id: number; type: "VFS_WIPED" }
  | { id: number; type: "FILES_IMPORTED" }
  | { id: number; type: "FILE_IMPORT_ERROR"; error: string }
  | { id: number; type: "FILES_LOADED"; payload: any }
  | { id: number; type: "FILE_LOAD_ERROR"; error: string }
  | { id: number; type: "FILE_READ"; payload: { filePath: string; fileType: string; fileContent: string } }
  | { id: number; type: "FILE_READ_ERROR"; error: string }
  | { id: number; type: "FILE_DELETED"; filePath: string }
  | { id: number; type: "FILE_DELETE_ERROR"; error: string }
  | { id: number; type: "FILE_SAVED"; filePath: string }
  | { id: number; type: "FILE_SAVE_ERROR"; error: string }
  | { id: number; type: "FILES_CLEARED"; directory?: string }
  | { id: number; type: "FILE_CLEAR_ERROR"; error: string }
  | { id: number; type: "SNAPSHOT_READ"; payload: any }
  | { id: number; type: "SNAPSHOT_DOWNLOADED"; payload: string }
  | { id: number; type: "PYODIDE_READY" };