let pyodideInstance: any = null;

export const initPyodide = async () => {
  if (pyodideInstance) return pyodideInstance;

  pyodideInstance = await (window as any).loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
  });

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