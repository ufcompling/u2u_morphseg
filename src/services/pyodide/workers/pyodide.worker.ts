/**
 * pyodide.worker.ts
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
 *   Incoming (from main thread) — WorkerInMessage
 *   Outgoing (to main thread)  — WorkerOutMessage
 *   Both defined in src/lib/worker-protocol.ts
 *
 * Author: Evan / Joshua
 * Created: 2026-02-17
 * Version: 0.3.0
 *
 * Dependencies: Pyodide 0.27.4, micropip, sklearn-crfsuite, python-crfsuite (whl)
 */

/// <reference lib="webworker" />

// Type-only imports are erased at compile time — safe for workers.
import type { TrainingCycleConfig } from "../../../lib/types";
import type { WorkerInMessage, WorkerOutMessage } from "../../../lib/worker-protocol";

console.log("[pyodide-worker] ===== WORKER SCRIPT STARTING =====");

// ── Globals ─────────────────────────────────────────────────────────────────

let pyodide: any = null;
let initPromise: Promise<void> | null = null;

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";
const CRFSUITE_WHL = `${self.location.origin}/u2u_morphseg/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl`;

const PERSIST_ROOT = "/persist";
const DEFAULT_WORK_DIR = `${PERSIST_ROOT}/turtleshell`;
const MODEL_FILENAME = "crf.model";

// ── IDBFS helpers ───────────────────────────────────────────────────────────

async function idbfsSync(populate: boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    pyodide.FS.syncfs(populate, (err: any) => {
      if (err) {
        console.warn(`[pyodide-worker] IDBFS sync (populate=${populate}) warning:`, err);
      }
      resolve();
    });
  });
}

async function syncVfsToIDB(): Promise<void> {
  await idbfsSync(false);
}

async function restoreVfsFromIDB(): Promise<void> {
  await idbfsSync(true);
}

function modelExists(): boolean {
  try {
    pyodide.FS.stat(`${DEFAULT_WORK_DIR}/${MODEL_FILENAME}`);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(path: string): void {
  try {
    pyodide.FS.mkdir(path);
  } catch {
    // EEXIST — directory already exists
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

async function initPyodide(): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    post({ type: "INIT_PROGRESS", step: "Loading Pyodide runtime…" });

    try {
      const pyodideModule = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
      const loadPyodideFunc = pyodideModule.loadPyodide;
      if (!loadPyodideFunc) {
        throw new Error("loadPyodide function not found in pyodide.mjs");
      }
      pyodide = await loadPyodideFunc({ indexURL: PYODIDE_CDN });
    } catch (err) {
      throw new Error(`Failed to load Pyodide: ${err}`);
    }

    // ── Mount IDBFS ───────────────────────────────────────────────────────
    post({ type: "INIT_PROGRESS", step: "Mounting persistent filesystem…" });
    try {
      ensureDir(PERSIST_ROOT);
      pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, PERSIST_ROOT);
      await restoreVfsFromIDB();
      ensureDir(DEFAULT_WORK_DIR);
    } catch (err) {
      console.warn("[pyodide-worker] IDBFS mount failed (non-fatal):", err);
      ensureDir(DEFAULT_WORK_DIR);
    }

    // ── Install Python packages ───────────────────────────────────────────
    post({ type: "INIT_PROGRESS", step: "Installing micropip…" });
    await pyodide.loadPackage("micropip");

    post({ type: "INIT_PROGRESS", step: "Installing Python packages…" });

    try {
      const whlResponse = await fetch(CRFSUITE_WHL);
      if (!whlResponse.ok) {
        throw new Error(`Wheel not found at ${CRFSUITE_WHL} (HTTP ${whlResponse.status})`);
      }
      if ((whlResponse.headers.get("content-type") || "").includes("text/html")) {
        throw new Error(`Wheel URL returned HTML. Check that .whl exists at ${CRFSUITE_WHL}`);
      }
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('${CRFSUITE_WHL}')
`);
    } catch (err) {
      throw new Error(`Failed to install python-crfsuite: ${err}`);
    }

    try {
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('sklearn-crfsuite')
`);
    } catch (err) {
      throw new Error(`Failed to install sklearn-crfsuite: ${err}`);
    }

    post({ type: "INIT_PROGRESS", step: "Loading CRF pipeline scripts…" });
    await loadPythonScripts();

    const hasModel = modelExists();
    console.log(`[pyodide-worker] Init complete. Model exists: ${hasModel}`);
    post({ type: "INIT_DONE", modelExists: hasModel });
  })().catch((err) => {
    initPromise = null;
    pyodide = null;
    post({ type: "INIT_ERROR", error: String(err) });
    throw err;
  });

  return initPromise;
}

async function loadPythonScripts(): Promise<void> {
  const [crfAlResp, bridgeResp] = await Promise.all([
    fetch("/u2u_morphseg/py/crf_al.py"),
    fetch("/u2u_morphseg/py/crf_bridge.py"),
  ]);

  if (!crfAlResp.ok) throw new Error(`Failed to fetch crf_al.py: ${crfAlResp.status}`);
  if (!bridgeResp.ok) throw new Error(`Failed to fetch crf_bridge.py: ${bridgeResp.status}`);

  const [crfAlText, bridgeText] = await Promise.all([
    crfAlResp.text(),
    bridgeResp.text(),
  ]);

  pyodide.FS.writeFile("/tmp/crf_al.py", crfAlText);
  pyodide.FS.writeFile("/tmp/crf_bridge.py", bridgeText);

  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/tmp')
exec(open('/tmp/crf_bridge.py').read())
`);
}

// ── Training cycle ──────────────────────────────────────────────────────────

async function runCycle(config: TrainingCycleConfig): Promise<void> {
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  step("init");
  pyodide.globals.set("_config_json", JSON.stringify(effectiveConfig));
  stepDone("init", "VFS ready");

  step("train");
  const resultJson: string = await pyodide.runPythonAsync(`run_training_cycle(_config_json)`);
  stepDone("train", "Model trained");

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
    post({ type: "CYCLE_ERROR", error: raw.error });
    return;
  }

  stepDone("predict", `${raw.incrementWords.length} words selected`);
  stepDone("select", `${raw.residualCount} words remain in pool`);

  cleanVfs(effectiveConfig.workDir);

  try {
    await syncVfsToIDB();
  } catch (err) {
    console.warn("[pyodide-worker] Post-cycle IDBFS sync failed (non-fatal):", err);
  }

  post({
    type: "CYCLE_DONE",
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
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  pyodide.globals.set("_inference_config_json", JSON.stringify(effectiveConfig));
  const resultJson: string = await pyodide.runPythonAsync(`run_inference(_inference_config_json)`);
  const raw = JSON.parse(resultJson) as {
    predictionsContent: string;
    totalWords: number;
    error: string | null;
  };

  if (raw.error) {
    post({ type: "INFERENCE_ERROR", error: raw.error });
    return;
  }

  post({
    type: "INFERENCE_DONE",
    result: { predictionsContent: raw.predictionsContent, totalWords: raw.totalWords },
  });
}

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
    // Non-fatal
  }
}

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
  } catch (err) {
    console.warn("[pyodide-worker] VFS wipe failed (non-fatal):", err);
  }
  post({ type: "VFS_WIPED" });
}

// ── Message handler ─────────────────────────────────────────────────────────

try {
  self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case "INIT":
        try { await initPyodide(); }
        catch (err) { console.error("[pyodide-worker] Init failed:", err); }
        break;

      case "RUN_CYCLE":
        try {
          if (!pyodide) await initPyodide();
          await runCycle(msg.payload);
        } catch (err) {
          post({ type: "CYCLE_ERROR", error: String(err) });
        }
        break;

      case "RUN_INFERENCE":
        try {
          if (!pyodide) await initPyodide();
          await runInference(msg.payload);
        } catch (err) {
          post({ type: "INFERENCE_ERROR", error: String(err) });
        }
        break;

      case "SYNC_VFS":
        try {
          if (pyodide) await syncVfsToIDB();
        } catch { /* non-fatal */ }
        post({ type: "VFS_SYNCED" });
        break;

      case "WIPE_VFS":
        try {
          if (pyodide) await wipeVfs();
          else post({ type: "VFS_WIPED" });
        } catch {
          post({ type: "VFS_WIPED" });
        }
        break;
    }
  };
} catch (err) {
  console.error("[pyodide-worker] FATAL: Failed to set up worker:", err);
  try {
    (self as unknown as Worker).postMessage({
      type: "INIT_ERROR",
      error: `Worker setup failed: ${err}`,
    });
  } catch { /* terminal */ }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function post(msg: WorkerOutMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

function step(stepId: string): void {
  post({ type: "STEP_START", stepId });
}

function stepDone(stepId: string, detail?: string): void {
  post({ type: "STEP_DONE", stepId, detail });
}