/**
 * usePyodideWorker.ts
 * Location: src/hooks/usePyodideWorker.ts
 *
 * Purpose:
 *   Manages the Pyodide Web Worker lifecycle and exposes a clean async API
 *   for initialisation state and training cycle execution.
 *
 *   The worker is spawned once (lazy, on first use), kept alive across cycles,
 *   and terminated on component unmount. Step progress messages are forwarded
 *   as callbacks so useTurtleshell can update the TrainingStep UI in real time.
 *
 * Key Exports:
 *   usePyodideWorker()   — React hook
 *
 * Author: Evan
 * Created: 2026-02-17
 * Version: 0.1.0
 *
 * Dependencies: React 18+, pyodide.worker.ts
 *
 * Test Scenarios:
 *   - Worker not yet spawned: pyodideReady === false, pyodideError === null
 *   - Init in progress: pyodideLoading === true
 *   - Init complete: pyodideReady === true
 *   - Init fails (whl 404): pyodideError === "..."
 *   - runCycle() resolves with TrainingCycleResult on success
 *   - runCycle() rejects with Error on CYCLE_ERROR message
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { TrainingCycleConfig, TrainingCycleResult } from '../lib/types';
import type { WorkerOutMessage } from '../services/pyodide/workers/pyodide.worker';

export type StepProgressCallback = (stepId: string, done: boolean, detail?: string) => void;

export interface UsePyodideWorkerReturn {
  pyodideReady: boolean;
  pyodideLoading: boolean;
  pyodideError: string | null;
  /** Kick off a training cycle. Resolves when CYCLE_DONE is received. */
  runCycle: (
    config: TrainingCycleConfig,
    onStepProgress: StepProgressCallback
  ) => Promise<TrainingCycleResult>;
}

export function usePyodideWorker(): UsePyodideWorkerReturn {
  const workerRef = useRef<Worker | null>(null);

  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideError, setPyodideError] = useState<string | null>(null);

  // One pending cycle at a time — store its resolve/reject + step callback here
  const pendingCycle = useRef<{
    resolve: (r: TrainingCycleResult) => void;
    reject: (e: Error) => void;
    onStep: StepProgressCallback;
  } | null>(null);

  // ── Spawn worker once ────────────────────────────────────────────────────────
  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    console.log('[usePyodideWorker] Spawning worker...');
    
    // Vite handles Web Worker imports via `?worker` suffix or new Worker with URL constructor
    // Using the URL constructor pattern for module workers
    let worker: Worker;
    try {
      // This hook is at: src/hooks/usePyodideWorker.ts
      // Worker is at: src/services/pyodide/workers/pyodide.worker.ts
      // Relative path: ../services/pyodide/workers/pyodide.worker.ts
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
          // Could surface this in a loading toast — for now just console
          console.log('[usePyodideWorker] Init progress:', msg.step);
          break;

        case 'INIT_DONE':
          console.log('[usePyodideWorker] Pyodide ready!');
          setPyodideLoading(false);
          setPyodideReady(true);
          break;

        case 'INIT_ERROR':
          console.error('[usePyodideWorker] Init error:', msg.error);
          setPyodideLoading(false);
          setPyodideError(msg.error);
          break;

        case 'STEP_START':
          console.log('[usePyodideWorker] Step start:', msg.stepId);
          pendingCycle.current?.onStep(msg.stepId, false);
          break;

        case 'STEP_DONE':
          console.log('[usePyodideWorker] Step done:', msg.stepId, msg.detail);
          pendingCycle.current?.onStep(msg.stepId, true, msg.detail);
          break;

        case 'CYCLE_DONE':
          console.log('[usePyodideWorker] Cycle complete');
          pendingCycle.current?.resolve(msg.result);
          pendingCycle.current = null;
          break;

        case 'CYCLE_ERROR':
          console.error('[usePyodideWorker] Cycle error:', msg.error);
          pendingCycle.current?.reject(new Error(msg.error));
          pendingCycle.current = null;
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

  // ── Auto-init on mount ───────────────────────────────────────────────────────
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

  // ── Public API ────────────────────────────────────────────────────────────────
  const runCycle = useCallback(
    (config: TrainingCycleConfig, onStepProgress: StepProgressCallback): Promise<TrainingCycleResult> => {
      return new Promise((resolve, reject) => {
        if (pendingCycle.current) {
          console.warn('[usePyodideWorker] Cycle already running, rejecting new request');
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

  return { pyodideReady, pyodideLoading, pyodideError, runCycle };
}