declare const pyodide: any;

/**
 * Sync the Emscripten FS with IndexedDB.
 * :param populate: when true, populate the in-memory FS from IndexedDB (load); when false, persist memory to IndexedDB (save).
 */
export function syncPyodideFS(populate: boolean = false): Promise<void> {
  if (!pyodide) throw new Error("Pyodide not initialized for FS sync");
  return new Promise((resolve, reject) => {
    try {
      pyodide.FS.syncfs(populate, (err: any) => {
        if (err) {
          reject(err);
          console.error('[worker] Error syncing FS to IndexedDB:', err);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
      console.error('[worker] FS.syncfs threw:', err);
    }
  });
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