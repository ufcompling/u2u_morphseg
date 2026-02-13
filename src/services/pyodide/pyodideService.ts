let pyodideInstance: any = null;

export const initPyodide = async () => {
  if (pyodideInstance) return pyodideInstance;
  try {
    pyodideInstance = await (window as any).loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
    });
  } catch (error) {
    console.error("Error loading Pyodide:", error);
    throw error;
  }

  // Ensure /data directory exists in the virtual filesystem
  await pyodideInstance.runPythonAsync("import os; os.makedirs('/data', exist_ok=True)");


  // Fetch db_worker.py from public/scripts and write to /scripts in Pyodide FS
  const dbWorkerUrl = '/u2u_morphseg/scripts/db_worker.py';
  const response = await fetch(dbWorkerUrl);
  if (!response.ok) {
    console.error(`Failed to fetch ${dbWorkerUrl}: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch ${dbWorkerUrl}: ${response.status} ${response.statusText}`);
  }
  const dbWorkerCode = await response.text();
  const ensureDir = (fs: any, dirPath: string) => {
    const parts = dirPath.split('/').filter(Boolean);
    let cur = '';
    for (const p of parts) {
      cur += '/' + p;
      try {
        fs.mkdir(cur);
      } catch (e) {
        // ignore errors (directory may already ex/ist)
      }
    }
  };

  try {
    ensureDir(pyodideInstance.FS, '/u2u_morphseg/scripts');
    ensureDir(pyodideInstance.FS, '/data');    
    pyodideInstance.FS.writeFile('/u2u_morphseg/scripts/db_worker.py', dbWorkerCode);
  } catch (error) {
    console.error('Error ensuring /data & /u2u_morphseg/scripts directory in Pyodide FS:', error);
    throw error;
  }
  try {
    pyodideInstance.FS.mount(pyodideInstance.FS.filesystems.IDBFS, {}, '/data');
  } catch (err) {
    // Mount may already exist or IDBFS not available; log and continue
    console.warn('IDBFS mount warning (may be already mounted or unsupported):', err);
  }
  await new Promise<void>((resolve) => {
    pyodideInstance.FS.syncfs(true, (err: any) => {
      if (err) {
        console.warn('Warning: FS.syncfs failed to load persisted files:', err);
        // resolve anyway so app can continue, but warn
        resolve();
      } else resolve();
    });
  });
  // Add /scripts to sys.path and import db_worker
  await pyodideInstance.runPythonAsync("import sys; sys.path.append('/u2u_morphseg/scripts')");
  await pyodideInstance.runPythonAsync("import db_worker");

  return pyodideInstance;
};

export const getPyodide = () => {
  if (!pyodideInstance) {
    throw new Error("Pyodide has not been initialized yet.");
  }
  return pyodideInstance;
};


export const runPythonCode = async (pyodide: any, fileContent: string, pycodeLoc: string, funcName: string): Promise<string> => {
  const response = await fetch(pycodeLoc);
  const scriptText = await response.text();

  // 2. Load the content into Python
  pyodide.globals.set('file_content', fileContent);

  // 3. Run the script and call the specific function
  pyodide.runPython(scriptText);
  // return pyodide.runPython('process_data(file_content)');
  return pyodide.runPython(funcName+'(file_content)');
};