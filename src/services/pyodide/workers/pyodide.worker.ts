/**
 * pyodide_worker.ts
 * Location: src/services/pyodide/workers/pyodide.worker.ts
 *
 * Purpose:
 *   Runs Pyodide (Python/WASM) in a Web Worker so CRF training never blocks
 *   the UI thread. Handles the full lifecycle: load → install deps → run cycle.
 *
 *   IDBFS Persistence:
 *     The Emscripten IDBFS filesystem is mounted at /persist. All model artifacts
 *     (crf.model, training files) are written to /persist/turtleshell so they
 *     survive page refresh. FS.syncfs() is called after every cycle and can be
 *     triggered manually via the SYNC_VFS message.
 *
 * Message Protocol:
 *   Incoming (from main thread) – WorkerInMessage
 *   Outgoing (to main thread)  – WorkerOutMessage
 *
 * Author: Evan / Joshua
 * Created: 2026-02-17
 * Version: 0.2.0
 *
 * Dependencies: Pyodide 0.27.4, micropip, sklearn-crfsuite, python-crfsuite (whl)
 */

/// <reference lib="webworker" />

console.log('[pyodide-worker] ===== WORKER SCRIPT STARTING =====');

// ── Inline Types (avoid module imports in workers) ──────────────────────────

interface MorphemeBoundary {
  index: number;
}

interface AnnotationWord {
  id: string;
  word: string;
  boundaries: MorphemeBoundary[];
  confidence: number;
}

interface TrainingCycleConfig {
  trainTgt: string;
  testTgt: string;
  selectTgt: string;
  selectSrc: string;
  incrementSize: number;
  maxIterations: number;
  delta: number;
  selectSize: number;
  workDir?: string;
}

interface TrainingCycleResult {
  precision: number;
  recall: number;
  f1: number;
  incrementWords: AnnotationWord[];
  residualCount: number;
  incrementContent: string;
  residualContent: string;
  evaluationContent: string;
}

// ── Message shapes ──────────────────────────────────────────────────────────

export type WorkerInMessage =
  | { type: 'INIT' }
  | { type: 'RUN_CYCLE'; payload: TrainingCycleConfig }
  | { type: 'RUN_INFERENCE'; payload: { residualTgt: string; delta?: number; workDir?: string } }
  | { type: 'SYNC_VFS' }
  | { type: 'WIPE_VFS' };

export type WorkerOutMessage =
  | { type: 'INIT_PROGRESS'; step: string }
  | { type: 'INIT_DONE'; modelExists: boolean }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'STEP_START'; stepId: string }
  | { type: 'STEP_DONE'; stepId: string; detail?: string }
  | { type: 'CYCLE_DONE'; result: TrainingCycleResult }
  | { type: 'CYCLE_ERROR'; error: string }
  | { type: 'INFERENCE_DONE'; result: { predictionsContent: string; totalWords: number } }
  | { type: 'INFERENCE_ERROR'; error: string }
  | { type: 'VFS_SYNCED' }
  | { type: 'VFS_WIPED' };

// ── Globals ─────────────────────────────────────────────────────────────────

declare const loadPyodide: (opts: { indexURL: string }) => Promise<any>;

let pyodide: any = null;
let initPromise: Promise<void> | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/';
const CRFSUITE_WHL = `${self.location.origin}/u2u_morphseg/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl`;

/** Persistent workDir — everything under /persist is backed by IDBFS. */
const PERSIST_ROOT = '/persist';
const DEFAULT_WORK_DIR = `${PERSIST_ROOT}/turtleshell`;
const MODEL_FILENAME = 'crf.model';

// ── IDBFS helpers ───────────────────────────────────────────────────────────

/**
 * Sync Emscripten FS ↔ IndexedDB.
 * @param populate  true = read FROM IndexedDB into VFS (restore)
 *                  false = write FROM VFS into IndexedDB (persist)
 */
async function idbfsSync(populate: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pyodide.FS.syncfs(populate, (err: any) => {
      if (err) {
        console.warn(`[pyodide-worker] IDBFS sync (populate=${populate}) warning:`, err);
        // Non-fatal on first run — there's nothing to restore yet
        resolve();
      } else {
        console.log(`[pyodide-worker] IDBFS sync (populate=${populate}) complete`);
        resolve();
      }
    });
  });
}

/** Persist current VFS state to IndexedDB. */
async function syncVfsToIDB(): Promise<void> {
  await idbfsSync(false);
}

/** Restore VFS state from IndexedDB. */
async function restoreVfsFromIDB(): Promise<void> {
  await idbfsSync(true);
}

/** Check whether a trained model file exists at the default workDir. */
function modelExists(): boolean {
  try {
    pyodide.FS.stat(`${DEFAULT_WORK_DIR}/${MODEL_FILENAME}`);
    return true;
  } catch {
    return false;
  }
}

/** Ensure a directory exists, no-op if it already does. */
function ensureDir(path: string): void {
  try {
    pyodide.FS.mkdir(path);
  } catch {
    // EEXIST — directory already exists (e.g., restored from IDBFS)
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

async function initPyodide(): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[pyodide-worker] Starting initialization...');
    post({ type: 'INIT_PROGRESS', step: 'Loading Pyodide runtime…' });

    console.log(`[pyodide-worker] Loading Pyodide from ${PYODIDE_CDN}`);
    try {
      const pyodideModule = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
      const loadPyodideFunc = pyodideModule.loadPyodide;
      if (!loadPyodideFunc) {
        throw new Error('loadPyodide function not found in pyodide.mjs');
      }
      console.log('[pyodide-worker] Calling loadPyodide...');
      pyodide = await loadPyodideFunc({ indexURL: PYODIDE_CDN });
      console.log('[pyodide-worker] Pyodide loaded successfully');
    } catch (err) {
      console.error('[pyodide-worker] Failed to load Pyodide:', err);
      throw new Error(`Failed to load Pyodide: ${err}`);
    }

    // ── Mount IDBFS for persistent model storage ──────────────────────────
    post({ type: 'INIT_PROGRESS', step: 'Mounting persistent filesystem…' });
    try {
      ensureDir(PERSIST_ROOT);
      pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, PERSIST_ROOT);
      await restoreVfsFromIDB();
      ensureDir(DEFAULT_WORK_DIR);
      const restored = modelExists();
      console.log(`[pyodide-worker] IDBFS mounted at ${PERSIST_ROOT}, model restored: ${restored}`);
    } catch (err) {
      // IDBFS failure is non-fatal — training still works, just won't persist
      console.warn('[pyodide-worker] IDBFS mount failed (non-fatal):', err);
      ensureDir(DEFAULT_WORK_DIR);
    }

    // ── Install Python packages ───────────────────────────────────────────
    post({ type: 'INIT_PROGRESS', step: 'Installing micropip…' });
    console.log('[pyodide-worker] Loading micropip package...');
    await pyodide.loadPackage('micropip');

    post({ type: 'INIT_PROGRESS', step: 'Installing Python packages…' });

    console.log(`[pyodide-worker] Installing python-crfsuite from ${CRFSUITE_WHL}`);
    try {
      const whlResponse = await fetch(CRFSUITE_WHL);
      console.log(`[pyodide-worker] Wheel fetch status: ${whlResponse.status}`);
      if (!whlResponse.ok) {
        throw new Error(`Wheel file not found at ${CRFSUITE_WHL} (HTTP ${whlResponse.status})`);
      }
      const contentType = whlResponse.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(`Wheel URL returned HTML instead of .whl file. Check that the file exists at ${CRFSUITE_WHL}`);
      }
      console.log('[pyodide-worker] Installing python-crfsuite from local wheel...');
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('${CRFSUITE_WHL}')
`);
      console.log('[pyodide-worker] ✅ python-crfsuite installed successfully');
    } catch (err) {
      console.error('[pyodide-worker] Failed to install python-crfsuite wheel:', err);
      throw new Error(`Failed to install python-crfsuite: ${err}`);
    }

    console.log('[pyodide-worker] Installing sklearn-crfsuite from PyPI...');
    try {
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('sklearn-crfsuite')
`);
      console.log('[pyodide-worker] ✅ sklearn-crfsuite installed successfully');
    } catch (err) {
      console.error('[pyodide-worker] Failed to install sklearn-crfsuite:', err);
      throw new Error(`Failed to install sklearn-crfsuite: ${err}`);
    }

    post({ type: 'INIT_PROGRESS', step: 'Loading CRF pipeline scripts…' });
    console.log('[pyodide-worker] Fetching Python scripts...');
    await loadPythonScripts();

    const hasModel = modelExists();
    console.log(`[pyodide-worker] Initialization complete! Model exists: ${hasModel}`);
    post({ type: 'INIT_DONE', modelExists: hasModel });
  })().catch((err) => {
    initPromise = null;
    pyodide = null;
    post({ type: 'INIT_ERROR', error: String(err) });
    throw err;
  });

  return initPromise;
}

/**
 * Fetch crf_al.py and crf_bridge.py and write them into Pyodide's VFS at
 * /tmp so that `import crf_al` works in the bridge script.
 */
async function loadPythonScripts(): Promise<void> {
  console.log('[pyodide-worker] Fetching /u2u_morphseg/py/crf_al.py');
  const crfAlResp = await fetch('/u2u_morphseg/py/crf_al.py');
  if (!crfAlResp.ok) {
    throw new Error(`Failed to fetch crf_al.py: ${crfAlResp.status} ${crfAlResp.statusText}`);
  }
  const crfAlText = await crfAlResp.text();
  console.log(`[pyodide-worker] Fetched crf_al.py (${crfAlText.length} bytes)`);

  console.log('[pyodide-worker] Fetching /u2u_morphseg/py/crf_bridge.py');
  const bridgeResp = await fetch('/u2u_morphseg/py/crf_bridge.py');
  if (!bridgeResp.ok) {
    throw new Error(`Failed to fetch crf_bridge.py: ${bridgeResp.status} ${bridgeResp.statusText}`);
  }
  const bridgeText = await bridgeResp.text();
  console.log(`[pyodide-worker] Fetched crf_bridge.py (${bridgeText.length} bytes)`);

  console.log('[pyodide-worker] Writing Python files to VFS...');
  pyodide.FS.writeFile('/tmp/crf_al.py', crfAlText);
  pyodide.FS.writeFile('/tmp/crf_bridge.py', bridgeText);

  console.log('[pyodide-worker] Executing crf_bridge.py...');
  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/tmp')
exec(open('/tmp/crf_bridge.py').read())
`);
  console.log('[pyodide-worker] Python scripts loaded successfully');
}

// ── Training cycle ──────────────────────────────────────────────────────────

async function runCycle(config: TrainingCycleConfig): Promise<void> {
  // Override workDir to use the IDBFS-backed persistent path.
  // The caller doesn't need to know about IDBFS internals.
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  console.log('[pyodide-worker] Starting training cycle with config:', {
    trainTgtLines: effectiveConfig.trainTgt.split('\n').length,
    testTgtLines: effectiveConfig.testTgt.split('\n').length,
    selectTgtLines: effectiveConfig.selectTgt.split('\n').length,
    incrementSize: effectiveConfig.incrementSize,
    selectSize: effectiveConfig.selectSize,
    workDir: effectiveConfig.workDir,
  });

  step('init', 'Setting up virtual filesystem…');
  const configJson = JSON.stringify(effectiveConfig);
  pyodide.globals.set('_config_json', configJson);
  stepDone('init', 'VFS ready');

  step('train', 'Training CRF model…');
  console.log('[pyodide-worker] Calling run_training_cycle...');
  const resultJson: string = await pyodide.runPythonAsync(`
run_training_cycle(_config_json)
`);
  console.log('[pyodide-worker] Training complete, result JSON length:', resultJson.length);
  stepDone('train', 'Model trained');

  console.log('[pyodide-worker] Parsing result JSON...');
  const raw = JSON.parse(resultJson) as {
    precision: number;
    recall: number;
    f1: number;
    incrementWords: Array<{
      id: string;
      word: string;
      confidence: number;
      boundaries: Array<{ index: number }>;
    }>;
    residualCount: number;
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
    error: string | null;
  };

  if (raw.error) {
    console.error('[pyodide-worker] Python error:', raw.error);
    post({ type: 'CYCLE_ERROR', error: raw.error });
    return;
  }

  console.log('[pyodide-worker] Cycle results:', {
    precision: raw.precision,
    recall: raw.recall,
    f1: raw.f1,
    incrementWordsCount: raw.incrementWords.length,
    residualCount: raw.residualCount,
  });

  step('predict', 'Reading predictions…');
  stepDone('predict', `${raw.incrementWords.length} words selected`);

  step('select', 'Ranking by confidence…');
  stepDone('select', `${raw.residualCount} words remain in pool`);

  // Clean build artifacts but preserve the model file
  console.log('[pyodide-worker] Cleaning VFS...');
  cleanVfs(effectiveConfig.workDir);

  // Persist VFS (including crf.model) to IndexedDB so it survives refresh
  console.log('[pyodide-worker] Syncing VFS to IndexedDB...');
  try {
    await syncVfsToIDB();
  } catch (err) {
    console.warn('[pyodide-worker] Post-cycle IDBFS sync failed (non-fatal):', err);
  }

  console.log('[pyodide-worker] Cycle complete!');
  post({
    type: 'CYCLE_DONE',
    result: {
      precision: raw.precision,
      recall: raw.recall,
      f1: raw.f1,
      incrementWords: raw.incrementWords,
      residualCount: raw.residualCount,
      incrementContent: raw.incrementContent,
      residualContent: raw.residualContent,
      evaluationContent: raw.evaluationContent,
    },
  });
}

async function runInference(config: { residualTgt: string; delta?: number; workDir?: string }): Promise<void> {
  // Override workDir to match training's persistent path
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  console.log('[pyodide-worker] Starting inference over residual...');
  const configJson = JSON.stringify(effectiveConfig);
  pyodide.globals.set('_inference_config_json', configJson);

  const resultJson: string = await pyodide.runPythonAsync(`run_inference(_inference_config_json)`);
  const raw = JSON.parse(resultJson) as {
    predictionsContent: string;
    totalWords: number;
    error: string | null;
  };

  if (raw.error) {
    console.error('[pyodide-worker] Inference error:', raw.error);
    post({ type: 'INFERENCE_ERROR', error: raw.error });
    return;
  }

  console.log(`[pyodide-worker] Inference complete: ${raw.totalWords} words`);
  post({ type: 'INFERENCE_DONE', result: { predictionsContent: raw.predictionsContent, totalWords: raw.totalWords } });
}

/**
 * Delete .pyc files and __pycache__ dirs to keep the VFS lean.
 * Preserves .model files — these are the trained CRF weights we need to keep.
 */
function cleanVfs(workDir: string): void {
  try {
    pyodide.runPython(`
import os, shutil
for root, dirs, files in os.walk('${workDir}'):
    for f in files:
        if f.endswith('.pyc'):
            os.remove(os.path.join(root, f))
    for d in dirs:
        if d == '__pycache__':
            shutil.rmtree(os.path.join(root, d))
for d in ['/tmp/__pycache__']:
    if os.path.exists(d):
        shutil.rmtree(d)
`);
  } catch {
    // Non-fatal — don't break the cycle result over cleanup
  }
}

/**
 * Wipe all persisted VFS data — called by handleStartOver.
 * Removes the entire workDir contents then syncs the empty state to IndexedDB.
 */
async function wipeVfs(): Promise<void> {
  try {
    pyodide.runPython(`
import os, shutil
work_dir = '${DEFAULT_WORK_DIR}'
if os.path.exists(work_dir):
    shutil.rmtree(work_dir)
    os.makedirs(work_dir)
`);
    await syncVfsToIDB();
    console.log('[pyodide-worker] VFS wiped and synced');
  } catch (err) {
    console.warn('[pyodide-worker] VFS wipe failed (non-fatal):', err);
  }
  post({ type: 'VFS_WIPED' });
}

// ── Message handler ─────────────────────────────────────────────────────────

try {
  console.log('[pyodide-worker] Worker script loaded, setting up message handler...');

  self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
    const msg = event.data;
    console.log('[pyodide-worker] Received message:', msg.type);

    switch (msg.type) {
      case 'INIT':
        try {
          await initPyodide();
        } catch (err) {
          console.error('[pyodide-worker] Init failed:', err);
        }
        break;

      case 'RUN_CYCLE':
        try {
          if (!pyodide) {
            console.log('[pyodide-worker] Pyodide not ready, initializing first...');
            await initPyodide();
          }
          await runCycle(msg.payload);
        } catch (err) {
          console.error('[pyodide-worker] Cycle failed:', err);
          post({ type: 'CYCLE_ERROR', error: String(err) });
        }
        break;

      case 'RUN_INFERENCE':
        try {
          if (!pyodide) await initPyodide();
          await runInference(msg.payload);
        } catch (err) {
          console.error('[pyodide-worker] Inference failed:', err);
          post({ type: 'INFERENCE_ERROR', error: String(err) });
        }
        break;

      case 'SYNC_VFS':
        try {
          if (pyodide) await syncVfsToIDB();
          post({ type: 'VFS_SYNCED' });
        } catch (err) {
          console.warn('[pyodide-worker] Manual sync failed:', err);
          post({ type: 'VFS_SYNCED' }); // Still ack so caller isn't stuck
        }
        break;

      case 'WIPE_VFS':
        try {
          if (pyodide) await wipeVfs();
          else post({ type: 'VFS_WIPED' });
        } catch (err) {
          console.warn('[pyodide-worker] Wipe failed:', err);
          post({ type: 'VFS_WIPED' });
        }
        break;
    }
  };

  console.log('[pyodide-worker] Message handler ready');

} catch (err) {
  console.error('[pyodide-worker] FATAL: Failed to set up worker:', err);
  try {
    (self as unknown as Worker).postMessage({
      type: 'INIT_ERROR',
      error: `Worker setup failed: ${err}`
    });
  } catch {
    // Can't even post messages — worker is completely broken
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function post(msg: WorkerOutMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

function step(stepId: string, detail?: string): void {
  post({ type: 'STEP_START', stepId, detail } as WorkerOutMessage & { detail?: string });
}

function stepDone(stepId: string, detail?: string): void {
  post({ type: 'STEP_DONE', stepId, detail });
}