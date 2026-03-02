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
  | { type: "INIT" }
  | { type: "RUN_CYCLE"; payload: TrainingCycleConfig }
  | { type: "RUN_INFERENCE"; payload: { residualTgt: string; delta?: number; workDir?: string } }
  | { type: "SYNC_VFS" }
  | { type: "WIPE_VFS" };

// ── Messages: Worker → Main Thread ────────────────────────────────────────────

export type WorkerOutMessage =
  | { type: "INIT_PROGRESS"; step: string }
  | { type: "INIT_DONE"; modelExists: boolean }
  | { type: "INIT_ERROR"; error: string }
  | { type: "STEP_START"; stepId: string }
  | { type: "STEP_DONE"; stepId: string; detail?: string }
  | { type: "CYCLE_DONE"; result: TrainingCycleResult }
  | { type: "CYCLE_ERROR"; error: string }
  | { type: "INFERENCE_DONE"; result: InferenceResult }
  | { type: "INFERENCE_ERROR"; error: string }
  | { type: "VFS_SYNCED" }
  | { type: "VFS_WIPED" };