/**
 * pyodide.worker.ts
 *
 * Purpose:
 *   Runs Pyodide (Python/WASM) in a Web Worker so CRF training never blocks
 *   the UI thread. Handles the full lifecycle: load → install deps → run cycle.
 *
 *   IDBFS Persistence:
 *     The Emscripten IDBFS filesystem is mounted at /data. All model artifacts
 *     (crf.model, training files) are written to /data/ so they
 *     survive page refresh. FS.syncfs() is called after every cycle and can be
 *     triggered manually via the SYNC_VFS message.
 *
 * Message Protocol:
 *   Incoming (from main thread) — WorkerInMessage
 *   Outgoing (to main thread)  — WorkerOutMessage
 *   Both defined in src/lib/worker-protocol.ts
 */

/// <reference lib="webworker" />

// Type-only imports are erased at compile time — safe for workers.
import type { TrainingCycleConfig } from "../../../lib/types";
import type { WorkerInMessage, WorkerOutMessage } from "../../../lib/worker-protocol";
import { clearFiles } from "../../database/clearFiles";
import { deleteFile } from "../../database/deleteFile";
import { importFile } from "../../database/importFile";
import { loadFiles } from "../../database/loadFiles";
import { readFile } from "../../database/readFile";
import { saveFile } from "../../database/saveFile";
import { downloadSnapshot } from "../../database/downloadSnapshot.ts";
import { readSnapshot } from "../../database/readSnapshot.ts";
import { syncPyodideFS } from "../pyodideService.ts"

// Worker starting (silent)

// ── Globals ─────────────────────────────────────────────────────────────────


let pyodide: any = null;
let initPromise: Promise<void> | null = null;
let workerLanguage: string | undefined = undefined;

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";
const CRFSUITE_WHL = `${self.location.origin}/u2u_morphseg/wheels/python_crfsuite-0.9.12-cp312-cp312-pyodide_2024_0_wasm32.whl`;
const DATA_ROOT = "/data";
let DEFAULT_WORK_DIR = DATA_ROOT;
const MODEL_FILENAME = "crf.model";


// ── IDBFS helpers ──
function modelExists(): boolean {
  try {
    pyodide.FS.stat(`${DEFAULT_WORK_DIR}/${MODEL_FILENAME}`);
    return true;
  } catch {
    return false;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

async function initPyodide(id: number): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    post({id, type: "INIT_PROGRESS", step: "Loading Pyodide runtime…" });

    try {
      const pyodideModule = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
      const loadPyodideFunc = pyodideModule.loadPyodide;
      if (!loadPyodideFunc) {
        throw new Error("loadPyodide function not found in pyodide.mjs");
      }
      pyodide = await loadPyodideFunc({ indexURL: PYODIDE_CDN });
      // Set global variable for pyodideService.ts compatibility
      (self as any).pyodide = pyodide;
    } catch (err) {
      throw new Error(`Failed to load Pyodide: ${err}`);
    }

    // ── Create /scripts and /data, mount IDBFS before writing files ──
    post({id, type: "INIT_PROGRESS", step: "Mounting persistent filesystem…" });
    if (!pyodide) {
      throw new Error("Pyodide not initialized before FS operations");
    }
    try {
      pyodide.FS.mkdir('/scripts');
    } catch (e) {}
    try {
      pyodide.FS.mkdir('/data');
    } catch (e) {}
    try {
      pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, '/data');
    } catch (err) {
      console.warn("[pyodide-worker] IDBFS mount failed (non-fatal):", err);
    }
    // Populate the in-memory FS from IndexedDB on init so persisted files are restored.
    await syncPyodideFS(true);
    // Don't log verbose FS contents here to avoid noisy console output.

    // ── Add /scripts to sys.path ──
    await pyodide.runPythonAsync("import sys; sys.path.append('/scripts')");

    // ── Install Python packages ──
    post({id, type: "INIT_PROGRESS", step: "Installing micropip and Python packages…" });
    await pyodide.loadPackage('micropip');
    await pyodide.runPythonAsync(`
import micropip
await micropip.install('${CRFSUITE_WHL}')
await micropip.install('sklearn-crfsuite')
`);

    // ── Load db_worker.py and binary_extractor.py into /scripts ──
    const dbWorkerResp = await fetch('/u2u_morphseg/scripts/db_worker.py');
    if (dbWorkerResp.ok) {
      const dbWorkerCode = await dbWorkerResp.text();
      pyodide.FS.writeFile('/scripts/db_worker.py', dbWorkerCode);
    }
    const binaryExtractorResp = await fetch('/u2u_morphseg/scripts/binary_extractor.py');
    if (binaryExtractorResp.ok) {
      const binaryExtractorCode = await binaryExtractorResp.text();
      pyodide.FS.writeFile('/scripts/binary_extractor.py', binaryExtractorCode);
    }

    // ── Load CRF pipeline scripts as before ──
    post({id, type: "INIT_PROGRESS", step: "Loading CRF pipeline scripts…" });
    await loadPythonScripts();

    const hasModel = modelExists();
    post({id, type: "INIT_DONE", modelExists: hasModel });
    // Also send PYODIDE_READY for compatibility with main thread listeners
    post({id, type: "PYODIDE_READY" });
  })().catch((err) => {
    initPromise = null;
    pyodide = null;
    post({id, type: "INIT_ERROR", error: String(err) });
    throw err;
  });

  return initPromise;
}

async function loadPythonScripts(): Promise<void> {

  const files = [
    "aliases.py",
    "evaluate.py",
    "features.py",
    "format.py",
    "model.py",
    "process_data.py",
    "run.py"
  ];

  const responses = await Promise.all(files.map(f => fetch(`/u2u_morphseg/scripts/${f}`)));

  for (let i = 0; i < files.length; i++) {
    if (!responses[i].ok) throw new Error(`Failed to fetch ${files[i]}: ${responses[i].status}`)
  }

  const texts = await Promise.all(responses.map(r => r.text()));

  for (let i = 0; i < files.length; i++) {
    pyodide.FS.writeFile(`/tmp/${files[i]}`, texts[i])
  }

  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/tmp')
exec(open('/tmp/run.py').read())
`);
}

// ── Training cycle ──────────────────────────────────────────────────────────

async function runCycle(config: TrainingCycleConfig, id: number): Promise<void> {
  if (!pyodide) await initPyodide(id);
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  step("init", id);
  pyodide.globals.set("_config_json", JSON.stringify(effectiveConfig));
  stepDone("init", "VFS ready", id);

  step("train", id);
  const resultJson: string = await pyodide.runPythonAsync(`run_training_cycle(_config_json)`);
  cleanVfs(effectiveConfig.workDir);
  try {
    post({ id, type: 'CYCLE_RAW', payload: String(resultJson) });
  } catch (e) {
    console.error('[pyodide-worker] Failed to post CYCLE_RAW:', e);
  }
  stepDone("train", "Model trained", id);

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
    post({ id, type: "CYCLE_ERROR", error: raw.error });
    return;
  }

  // Debug: log words the model is unsure about (low confidence)
  try {
    const UNCERTAIN_THRESHOLD = 0.6;
    const uncertain = (raw.incrementWords || []).filter((w: any) => typeof w.confidence === 'number' && w.confidence <= UNCERTAIN_THRESHOLD);
    if (uncertain.length) {
      console.log('[pyodide-worker] Uncertain words (<= ' + UNCERTAIN_THRESHOLD + '):', uncertain.map((w: any) => ({ word: w.word, confidence: w.confidence })));
    } else {
      console.log('[pyodide-worker] No uncertain words (threshold=' + UNCERTAIN_THRESHOLD + ')');
    }
  } catch (e) {
    console.warn('[pyodide-worker] Failed to log uncertain words', e);
  }

  stepDone("predict", `${raw.incrementWords.length} words selected`, id);
  stepDone("select", `${raw.residualCount} words remain in pool`, id);

  cleanVfs(effectiveConfig.workDir);

  try {
    await syncPyodideFS(); // Sync to IndexedDB (save)
  } catch (err) {
    console.warn("[pyodide-worker] Post-cycle IDBFS sync failed (non-fatal):", err);
  }

  post({
    id,
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

async function runInference(config: { residualTgt: string; delta?: number; workDir?: string }, id: number): Promise<void> {
  if (!pyodide) await initPyodide(id);
  const effectiveConfig = { ...config, workDir: DEFAULT_WORK_DIR };

  pyodide.globals.set("_inference_config_json", JSON.stringify(effectiveConfig));
  const resultJson: string = await pyodide.runPythonAsync(`run_inference(_inference_config_json)`);
  const raw = JSON.parse(resultJson) as {
    predictionsContent: string;
    totalWords: number;
    error: string | null;
  };

  if (raw.error) {
    post({id, type: "INFERENCE_ERROR", error: raw.error });
    return;
  }

  post({
    id,
    type: "INFERENCE_DONE",
    result: { predictionsContent: raw.predictionsContent, totalWords: raw.totalWords },
  });
}

function cleanVfs(workDir: string): void {
  try {
    if (!pyodide) return;
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

async function wipeVfs(id: number): Promise<void> {
  try {
    if (!pyodide) return;
    pyodide.runPython(`
import os, shutil
work_dir = '${DEFAULT_WORK_DIR}'
if os.path.exists(work_dir):
    shutil.rmtree(work_dir)
    os.makedirs(work_dir)
`);
    await syncPyodideFS();
  } catch (err) {
    console.warn("[pyodide-worker] VFS wipe failed (non-fatal):", err);
  }
  post({id, type: "VFS_WIPED" });
}

// ── Message handler ─────────────────────────────────────────────────────────

try {
  self.onmessage = async (event: MessageEvent) => {
    // Message received (silent)
    const raw = event.data as any;

    // Fast-path language message so TypeScript doesn't need to widen the union
    if (raw && raw.type === "SET_LANGUAGE") {
      workerLanguage = raw.language;
      try {
        (self as any).language = workerLanguage;
      } catch {}
      DEFAULT_WORK_DIR = `${DATA_ROOT}/${workerLanguage}`;
      try {
        if (pyodide) {
          try { pyodide.FS.mkdir(DEFAULT_WORK_DIR); } catch {}
        }
      } catch {}
      // language set (silent)
      return;
    }

    const msg = raw as WorkerInMessage;
    const id = msg.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function postWithId(message: any) {
      post({ ...message, id } as WorkerOutMessage);
    }
    switch (msg.type) {
      case "INIT":
        try { await initPyodide(id); postWithId({ type: "INIT_DONE", modelExists: modelExists() }); }
        catch (err) { postWithId({ type: "INIT_ERROR", error: String(err) }); }
        break;

      case "RUN_CYCLE":
        try {
          if (!pyodide) await initPyodide(id);
          await runCycle(msg.payload, id);
        } catch (err) {
          postWithId({ type: "CYCLE_ERROR", error: String(err) });
        }
        break;

      case "RUN_INFERENCE":
        try {
          if (!pyodide) await initPyodide(id);
          await runInference(msg.payload, id);
        } catch (err) {
          postWithId({ type: "INFERENCE_ERROR", error: String(err) });
        }
        break;

      case "SYNC_VFS":
        try {
          if (pyodide) await syncPyodideFS();
        } catch { /* non-fatal */ }
        postWithId({ type: "VFS_SYNCED" });
        break;

      case "WIPE_VFS":
        try {
          if (pyodide) await wipeVfs(id);
          else postWithId({ type: "VFS_WIPED" });
        } catch (err) {
          console.warn('[pyodide-worker] WIPE_VFS handler failed (non-fatal):', err);
          postWithId({ type: "VFS_WIPED" });
        }
        break;
      case "IMPORT_FILES":
        try {
          if (!pyodide) await initPyodide(id);
          await importFile(msg.fileName, msg.fileContent);
          postWithId({ type: "FILES_IMPORTED" });
        } catch (err) {
          postWithId({ type: "FILE_IMPORT_ERROR", error: String(err) });
        }
        break;
      case "LOAD_FILES":
        try {
          if (!pyodide) await initPyodide(id);
          if (!workerLanguage) throw new Error("Language not set in worker. Please send SET_LANGUAGE first.");
          const files = await loadFiles();
          postWithId({ type: "FILES_LOADED", payload: files });
        } catch (err) {
          postWithId({ type: "FILE_LOAD_ERROR", error: String(err) });
        }
        break;
      case "READ_FILE":
        try {
          if (!pyodide) await initPyodide(id);
          const { fileType, fileContent } = await readFile(msg.filePath);
          postWithId({ type: "FILE_READ", payload: { filePath: msg.filePath, fileType, fileContent } });
        } catch (err) {
          console.error("[pyodide-worker] FILE_READ_ERROR:", err);
          postWithId({ type: "FILE_READ_ERROR", error: String(err) });
        }
        break;
      case "DELETE_FILE":
        try {
          if (!pyodide) await initPyodide(id);
          await deleteFile(msg.filePath);
          postWithId({ type: "FILE_DELETED", filePath: msg.filePath });
        } catch (err) {
          console.error("[pyodide-worker] FILE_DELETE_ERROR:", err);
          postWithId({ type: "FILE_DELETE_ERROR", error: String(err) });
        }
        break;
      case "SAVE_FILE":
        try {
          if (!pyodide) await initPyodide(id);
          await saveFile(msg.filePath, msg.fileContent);
          postWithId({ type: "FILE_SAVED", filePath: msg.filePath });
        } catch (err) {
          console.error("[pyodide-worker] FILE_SAVE_ERROR:", err);
          postWithId({ type: "FILE_SAVE_ERROR", error: String(err) });
        }
        break;
      case "CLEAR_FILES":
        try {
          if (!pyodide) await initPyodide(id);
          await clearFiles(msg.directory);
          postWithId({ type: "FILES_CLEARED", directory: msg.directory });
        } catch (err) {
          postWithId({ type: "FILE_CLEAR_ERROR", error: String(err) });
        }
        break;
      case "DOWNLOAD_SNAPSHOT":
        try {
          if (!pyodide) await initPyodide(id);
          const snapshotData = await downloadSnapshot();
          postWithId({ type: "SNAPSHOT_DOWNLOADED", payload: snapshotData });
        } catch (err) {
          console.error("[pyodide-worker] DOWNLOAD_SNAPSHOT_ERROR:", err);
          postWithId({ type: "FILE_SAVE_ERROR", error: String(err) });
        }
        break;
      case "READ_SNAPSHOT":
        try {
          if (!pyodide) await initPyodide(id);
          await readSnapshot(msg.snapshotJson);
          postWithId({ type: "SNAPSHOT_READ", payload: null });
        } catch (err) {
          console.error("[pyodide-worker] READ_SNAPSHOT_ERROR:", err);
          postWithId({ type: "FILE_READ_ERROR", error: String(err) });
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
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg as unknown);
}

function step(stepId: string, id: number): void {
  post({id, type: "STEP_START", stepId });
}

function stepDone(stepId: string, detail: string | undefined, id: number): void {
  post({id, type: "STEP_DONE", stepId, detail });
}