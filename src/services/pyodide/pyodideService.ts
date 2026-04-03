declare const pyodide: any;

// ── syncfs queue ─────────────────────────────────────────────────────────────
// Emscripten throws a warning (and produces incorrect behaviour) when two
// syncfs calls are in flight simultaneously.  We serialize them: if a sync is
// already running, all new callers wait for that one to finish before starting
// their own.  "populate" syncs (load from IDB) are always run immediately;
// "persist" syncs (save to IDB) are coalesced — if one is already pending, the
// extra callers simply share its result.

let syncInFlight: Promise<void> | null = null;

function runSyncfs(populate: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      pyodide.FS.syncfs(populate, (err: any) => {
        if (err) {
          console.error('[worker] Error syncing FS to IndexedDB:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error('[worker] FS.syncfs threw:', err);
      reject(err);
    }
  });
}

/**
 * Sync the Emscripten FS with IndexedDB.
 * :param populate: when true, populate the in-memory FS from IndexedDB (load); when false, persist memory to IndexedDB (save).
 */
export function syncPyodideFS(populate: boolean = false): Promise<void> {
  if (!pyodide) throw new Error("Pyodide not initialized for FS sync");

  // Populate syncs (initial load) always run independently — they must
  // complete before any other FS operations happen.
  if (populate) {
    if (syncInFlight) {
      // Chain after whatever is currently running so the FS is stable first.
      return syncInFlight.then(() => runSyncfs(true)).finally(() => { syncInFlight = null; });
    }
    syncInFlight = runSyncfs(true).finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  // Persist syncs: coalesce — reuse the in-flight promise if one exists.
  if (syncInFlight) {
    return syncInFlight;
  }
  syncInFlight = runSyncfs(false).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export const runPythonCode = async (fileContent: string, pycodeLoc: string, funcName: string): Promise<string> => {
  const response = await fetch(pycodeLoc);
  const scriptText = await response.text();

  // 2. Load the content into Python
  pyodide.globals.set('file_content', fileContent);

  // 3. Run the script and call the specific function
  pyodide.runPython(scriptText);
  // return pyodide.runPython('process_data(file_content)');
  return pyodide.runPython(funcName+'(file_content)');
};