/**
 * pyodide.worker.ts
 * Location: src/workers/pyodide.worker.ts
 *
 * Purpose:
 *   Runs Pyodide (Python/WASM) in a Web Worker so CRF training never blocks
 *   the UI thread. Handles the full lifecycle: load â†’ install deps â†’ run cycle.
 *
 * Message Protocol:
 *   Incoming (from main thread) â€” WorkerInMessage
 *   Outgoing (to main thread)  â€” WorkerOutMessage
 *
 * Author: Evan
 * Created: 2026-02-17
 * Version: 0.1.0
 *
 * Dependencies: Pyodide 0.27.4, micropip, sklearn-crfsuite, python-crfsuite (whl)
 */

/// <reference lib="webworker" />

console.log('[pyodide-worker] ===== WORKER SCRIPT STARTING =====');

// â”€â”€â”€ Inline Types (avoid module imports in workers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  precision: number;       // 0-1 range (normalized from Python's 0-100)
  recall: number;
  f1: number;
  incrementWords: AnnotationWord[];
  residualCount: number;
  incrementContent: string;
  residualContent: string;
  evaluationContent: string;
}

// â”€â”€â”€ Message shapes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type WorkerInMessage =
  | { type: 'INIT' }
  | { type: 'RUN_CYCLE'; payload: TrainingCycleConfig }
  | { type: 'RUN_INFERENCE'; payload: { residualTgt: string; delta?: number; workDir?: string } };

export type WorkerOutMessage =
  | { type: 'INIT_PROGRESS'; step: string }
  | { type: 'INIT_DONE' }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'STEP_START'; stepId: string }
  | { type: 'STEP_DONE'; stepId: string; detail?: string }
  | { type: 'CYCLE_DONE'; result: TrainingCycleResult }
  | { type: 'CYCLE_ERROR'; error: string }
  | { type: 'INFERENCE_DONE'; result: { predictionsContent: string; totalWords: number } }
  | { type: 'INFERENCE_ERROR'; error: string };

// â”€â”€â”€ Globals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

declare const loadPyodide: (opts: { indexURL: string }) => Promise<any>;

let pyodide: any = null;
let initPromise: Promise<void> | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/';
// Path to the python-crfsuite wheel - put this file in public/wheels/
const CRFSUITE_WHL = `${self.location.origin}/u2u_morphseg/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl`;

// â”€â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Load Pyodide and install Python deps. Idempotent â€” multiple callers share
 * the same initPromise so we never double-load.
 */
async function initPyodide(): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[pyodide-worker] Starting initialization...');
    post({ type: 'INIT_PROGRESS', step: 'Loading Pyodide runtimeâ€¦' });

    console.log(`[pyodide-worker] Loading Pyodide from ${PYODIDE_CDN}`);
    
    try {
      // Module workers can't use importScripts, must use dynamic import
      // Load the pyodide module from the CDN
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

    post({ type: 'INIT_PROGRESS', step: 'Installing micropipâ€¦' });
    console.log('[pyodide-worker] Loading micropip package...');
    await pyodide.loadPackage('micropip');

    post({ type: 'INIT_PROGRESS', step: 'Installing Python packagesâ€¦' });
    
    // CRITICAL: Install python-crfsuite FIRST (from local wheel)
    // sklearn-crfsuite depends on it, so we must install it before sklearn-crfsuite
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
      console.log('[pyodide-worker] âœ… python-crfsuite installed successfully');
    } catch (err) {
      console.error('[pyodide-worker] Failed to install python-crfsuite wheel:', err);
      throw new Error(`Failed to install python-crfsuite: ${err}`);
    }

    // Now install sklearn-crfsuite (which depends on python-crfsuite we just installed)
    console.log('[pyodide-worker] Installing sklearn-crfsuite from PyPI...');
    try {
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('sklearn-crfsuite')
`);
      console.log('[pyodide-worker] âœ… sklearn-crfsuite installed successfully');
    } catch (err) {
      console.error('[pyodide-worker] Failed to install sklearn-crfsuite:', err);
      throw new Error(`Failed to install sklearn-crfsuite: ${err}`);
    }

    post({ type: 'INIT_PROGRESS', step: 'Loading CRF pipeline scriptsâ€¦' });
    console.log('[pyodide-worker] Fetching Python scripts...');
    await loadPythonScripts();

    console.log('[pyodide-worker] Initialization complete!');
    post({ type: 'INIT_DONE' });
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
  // Both scripts are served as static assets from the public directory
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

  // Import the bridge module so run_training_cycle is available in globals
  console.log('[pyodide-worker] Executing crf_bridge.py...');
  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/tmp')
exec(open('/tmp/crf_bridge.py').read())
`);
  console.log('[pyodide-worker] Python scripts loaded successfully');
}

// â”€â”€â”€ Training cycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Run one active-learning cycle. Emits STEP_START/STEP_DONE for each
 * pipeline stage so the UI progress indicator stays in sync.
 *
 * @param config - Dataset content + model params from the main thread
 */
async function runCycle(config: TrainingCycleConfig): Promise<void> {
  const stepIds = ['init', 'train', 'predict', 'select'] as const;

  console.log('[pyodide-worker] Starting training cycle with config:', {
    trainTgtLines: config.trainTgt.split('\n').length,
    testTgtLines: config.testTgt.split('\n').length,
    selectTgtLines: config.selectTgt.split('\n').length,
    incrementSize: config.incrementSize,
    selectSize: config.selectSize,
  });

  step('init', 'Setting up virtual filesystemâ€¦');
  // Config is passed as a JSON string so Pyodide doesn't need to unpack a
  // JS proxy â€” plain string round-trips safely across the WASM boundary.
  const configJson = JSON.stringify(config);
  console.log('[pyodide-worker] Config JSON length:', configJson.length);
  pyodide.globals.set('_config_json', configJson);
  stepDone('init', 'VFS ready');

  step('train', 'Training CRF modelâ€¦');
  console.log('[pyodide-worker] Calling run_training_cycle...');
  // run_training_cycle does feature extraction + crf.fit internally and
  // writes increment/residual files to the VFS before returning.
  // This is the slow call â€” typically 5-30 s depending on dataset size.
  const resultJson: string = await pyodide.runPythonAsync(`
run_training_cycle(_config_json)
`);
  console.log('[pyodide-worker] Training complete, result JSON length:', resultJson.length);
  stepDone('train', 'Model trained');

  // Parse here so we can emit per-step status before returning everything
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

  step('predict', 'Reading predictionsâ€¦');
  stepDone('predict', `${raw.incrementWords.length} words selected`);

  step('select', 'Ranking by confidenceâ€¦');
  stepDone('select', `${raw.residualCount} words remain in pool`);

  // Clean up VFS build artifacts to keep IDBFS sync small
  // TODO: trigger IDBFS sync here once IndexedDB persistence is wired up
  console.log('[pyodide-worker] Cleaning VFS...');
  cleanVfs(config.workDir ?? '/tmp/turtleshell');

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
  console.log('[pyodide-worker] Starting inference over residual...');
  const configJson = JSON.stringify(config);
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

/** Delete .pyc files and __pycache__ dirs to keep the VFS lean. */
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
    // Non-fatal â€” don't break the cycle result over cleanup
  }
}

// â”€â”€â”€ Message handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          // Error already posted inside initPyodide
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
    }
  };

  console.log('[pyodide-worker] Message handler ready');
  
} catch (err) {
  console.error('[pyodide-worker] FATAL: Failed to set up worker:', err);
  // Try to post error back to main thread
  try {
    (self as unknown as Worker).postMessage({ 
      type: 'INIT_ERROR', 
      error: `Worker setup failed: ${err}` 
    });
  } catch {
    // Can't even post messages - worker is completely broken
  }
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function post(msg: WorkerOutMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

function step(stepId: string, detail?: string): void {
  post({ type: 'STEP_START', stepId, detail } as WorkerOutMessage & { detail?: string });
}

function stepDone(stepId: string, detail?: string): void {
  post({ type: 'STEP_DONE', stepId, detail });
}