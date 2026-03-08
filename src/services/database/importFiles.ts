// Used Copilot's autofill
import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;

export async function importFiles(fileName: string, fileContent: string | Uint8Array): Promise<void> {
  const allFiles = await pyodide.runPythonAsync(`import os, json; json.dumps(os.listdir('/data'))`);
  const fileNames = new Set(JSON.parse(allFiles));
  if (fileNames.has(fileName)) {
    return;
  }
  try {
    if (fileContent instanceof Uint8Array) {
      pyodide.globals.set('data_bytes', fileContent);
      await pyodide.runPythonAsync(
        `import db_worker; db_worker.save_binary('/data/${fileName}', data_bytes)`
      );
      await pyodide.runPythonAsync("globals().pop('data_bytes', None)");
    } else if (typeof fileContent === 'string') {
      pyodide.globals.set('text_data', fileContent);
      await pyodide.runPythonAsync(
        `import db_worker; db_worker.save_text('/data/${fileName}', text_data)`
      );
      await pyodide.runPythonAsync("globals().pop('text_data', None)");
    }
  } catch (error) {
    console.error(`Error importing file ${fileName}:`, error);
  }
  await syncPyodideFS();
}