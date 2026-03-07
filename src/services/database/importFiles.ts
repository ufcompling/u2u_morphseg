// Used Copilot's autofill
import { type rawData, mapData } from './dataHelpers';
import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;

export async function importFiles(files: FileList): Promise<void> {
  const allFiles = await pyodide.runPythonAsync(`import os, json; json.dumps(os.listdir('/data'))`);
  const fileNames = new Set(JSON.parse(allFiles));
  const rawDataArray: rawData[] = [];

  for (const file of Array.from(files)) {
    if (fileNames.has(file.name)) {
      continue;
    }
    let fileContent: string | Uint8Array;
    if (file.type.startsWith('text/')) {
      fileContent = await file.text();
    } else {
      const buffer = await file.arrayBuffer();
      fileContent = new Uint8Array(buffer);
    }
    rawDataArray.push({
      fileName: file.name,
      fileContent,
      fileSize: file.size,
      fileType: file.type
    });
  }
  const fileDataArray = mapData(rawDataArray);
  for (const fileData of fileDataArray) {
    try {
      if (fileData.fileContent instanceof Uint8Array) {
        pyodide.globals.set('data_bytes', fileData.fileContent);
        await pyodide.runPythonAsync(
          `import db_worker; db_worker.save_binary('/data/${fileData.fileName}', data_bytes)`
        );
        await pyodide.runPythonAsync("globals().pop('data_bytes', None)");
      } else if (typeof fileData.fileContent === 'string') {
        pyodide.globals.set('text_data', fileData.fileContent);
        await pyodide.runPythonAsync(
          `import db_worker; db_worker.save_text('/data/${fileData.fileName}', text_data)`
        );
        await pyodide.runPythonAsync("globals().pop('text_data', None)");
      }
    } catch (error) {
      console.error(`Error importing file ${fileData.fileName}:`, error);
    }
  }
  await syncPyodideFS(pyodide);
}