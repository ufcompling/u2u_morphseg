/**
 * usePyodideWorker.ts
 * Location: src/hooks/usePyodideWorker.ts
 *
 * Purpose:
 *   Manages the Pyodide Web Worker lifecycle and exposes a clean async API
 *   for initialisation state, training cycle execution, and VFS persistence.
 *
 *   The worker is spawned once (lazy, on first use), kept alive across cycles,
 *   and terminated on component unmount. Step progress messages are forwarded
 *   as callbacks so useTurtleshell can update the TrainingStep UI in real time.
 *
 *   IDBFS sync is handled internally by the worker after each cycle. This hook
 *   exposes wipeVfs() for the "start over" flow and modelRestored to indicate
 *   whether a trained model was found in IndexedDB on init.
 *
 * Author: Evan / Joshua
 * Created: 2026-02-17
 * Version: 0.2.0
 *
 * Dependencies: React 18+, pyodide.worker.ts
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { TrainingCycleConfig, TrainingCycleResult, InferenceConfig, InferenceResult } from '../lib/types';
import type { WorkerOutMessage } from '../services/pyodide/workers/pyodide.worker';

export type StepProgressCallback = (stepId: string, done: boolean, detail?: string) => void;

export interface UsePyodideWorkerReturn {
  pyodideReady: boolean;
  pyodideLoading: boolean;
  pyodideError: string | null;
  /** True if IDBFS restored a crf.model file from a previous session. */
  modelRestored: boolean;
  /** Kick off a training cycle. Resolves when CYCLE_DONE is received. */
  runCycle: (
    config: TrainingCycleConfig,
    onStepProgress: StepProgressCallback
  ) => Promise<TrainingCycleResult>;
  /** Run the trained model over all residual words. No retraining. */
  runInference: (config: InferenceConfig) => Promise<InferenceResult>;
  /** Wipe all persisted VFS data (model, artifacts). Used by "start over". */
  wipeVfs: () => Promise<void>;
}

export function usePyodideWorker(): UsePyodideWorkerReturn {
  const workerRef = useRef<Worker | null>(null);

  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideError, setPyodideError] = useState<string | null>(null);
  const [modelRestored, setModelRestored] = useState(false);

  // One pending cycle at a time — store its resolve/reject + step callback here
  const pendingCycle = useRef<{
    resolve: (r: TrainingCycleResult) => void;
    reject: (e: Error) => void;
    onStep: StepProgressCallback;
  } | null>(null);

  const pendingInference = useRef<{
    resolve: (r: InferenceResult) => void;
    reject: (e: Error) => void;
  } | null>(null);

  const pendingWipe = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);

  // ── Spawn worker once ──────────────────────────────────────────────────────
  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    console.log('[usePyodideWorker] Spawning worker...');
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../services/pyodide/workers/pyodide.worker.ts', import.meta.url),
        { type: 'module' }
      );
      console.log('[usePyodideWorker] Worker spawned successfully');
    } catch (err) {
      console.error('[usePyodideWorker] Failed to spawn worker:', err);
      throw err;
    }

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      console.log('[usePyodideWorker] Message from worker:', msg.type);

      switch (msg.type) {
        case 'INIT_PROGRESS':
          console.log('[usePyodideWorker] Init progress:', msg.step);
          break;

        case 'INIT_DONE':
          console.log('[usePyodideWorker] Pyodide ready! Model restored:', msg.modelExists);
          setPyodideLoading(false);
          setPyodideReady(true);
          setModelRestored(msg.modelExists);
          break;

        case 'INIT_ERROR':
          console.error('[usePyodideWorker] Init error:', msg.error);
          setPyodideLoading(false);
          setPyodideError(msg.error);
          break;

        case 'STEP_START':
          pendingCycle.current?.onStep(msg.stepId, false);
          break;

        case 'STEP_DONE':
          pendingCycle.current?.onStep(msg.stepId, true, msg.detail);
          break;

        case 'CYCLE_DONE':
          console.log('[usePyodideWorker] Cycle complete (VFS synced to IndexedDB)');
          setModelRestored(true); // Model now definitely exists
          pendingCycle.current?.resolve(msg.result);
          pendingCycle.current = null;
          break;

        case 'CYCLE_ERROR':
          console.error('[usePyodideWorker] Cycle error:', msg.error);
          pendingCycle.current?.reject(new Error(msg.error));
          pendingCycle.current = null;
          break;

        case 'INFERENCE_DONE':
          console.log('[usePyodideWorker] Inference complete');
          pendingInference.current?.resolve(msg.result);
          pendingInference.current = null;
          break;

        case 'INFERENCE_ERROR':
          console.error('[usePyodideWorker] Inference error:', msg.error);
          pendingInference.current?.reject(new Error(msg.error));
          pendingInference.current = null;
          break;

        case 'VFS_SYNCED':
          console.log('[usePyodideWorker] VFS synced');
          break;

        case 'VFS_WIPED':
          console.log('[usePyodideWorker] VFS wiped');
          setModelRestored(false);
          pendingWipe.current?.resolve();
          pendingWipe.current = null;
          break;
      }
    };

    worker.onerror = (err) => {
      const msg = err.message ?? 'Unknown worker error';
      console.error('[usePyodideWorker] Worker error:', msg, err);
      setPyodideError(msg);
      pendingCycle.current?.reject(new Error(msg));
      pendingCycle.current = null;
    };

    workerRef.current = worker;
    return worker;
  }, []);

  // ── Auto-init on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[usePyodideWorker] Component mounted, starting init...');
    setPyodideLoading(true);
    const worker = getWorker();
    worker.postMessage({ type: 'INIT' });

    return () => {
      console.log('[usePyodideWorker] Component unmounting, terminating worker...');
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  const runCycle = useCallback(
    (config: TrainingCycleConfig, onStepProgress: StepProgressCallback): Promise<TrainingCycleResult> => {
      return new Promise((resolve, reject) => {
        if (pendingCycle.current) {
          reject(new Error('A training cycle is already running'));
          return;
        }

        console.log('[usePyodideWorker] Starting cycle with config:', {
          trainTgtLines: config.trainTgt.split('\n').length,
          testTgtLines: config.testTgt.split('\n').length,
          selectTgtLines: config.selectTgt.split('\n').length,
        });

        pendingCycle.current = { resolve, reject, onStep: onStepProgress };
        getWorker().postMessage({ type: 'RUN_CYCLE', payload: config });
      });
    },
    [getWorker]
  );

  const runInference = useCallback(
    (config: InferenceConfig): Promise<InferenceResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }
        pendingInference.current = { resolve, reject };
        getWorker().postMessage({ type: 'RUN_INFERENCE', payload: config });
      });
    },
    [getWorker]
  );

  const wipeVfs = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        resolve(); // Nothing to wipe
        return;
      }
      pendingWipe.current = { resolve, reject };
      getWorker().postMessage({ type: 'WIPE_VFS' });
    });
  }, [getWorker]);

  return {
    pyodideReady,
    pyodideLoading,
    pyodideError,
    modelRestored,
    runCycle,
    runInference,
    wipeVfs,
  };
}