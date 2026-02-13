import { type rawData, mapData } from './dataHelpers';

export async function importFiles(pyodide: any, files: FileList, setStatus: (_status: string) => void) {
  setStatus('Importing...');
  const allFiles = await pyodide.runPythonAsync(`import os, json; json.dumps(os.listdir('/data'))`);
  const fileNames = new Set(JSON.parse(allFiles));
  const rawDataArray: rawData[] = [];

  for (const file of Array.from(files)) {
    if (fileNames.has(file.name)) {
      setStatus(`ID collision for ${file.name}. Skipping.`);
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
      if (fileData.fileType === 'binary') {
        pyodide.globals.set('b64_content', fileData.fileContent);
        await pyodide.runPythonAsync(`import db_worker; db_worker.save_base64('/data/${fileData.fileName}', b64_content)`);
        await pyodide.runPythonAsync('globals().pop("b64_content", None)');
      } else {
        await pyodide.runPythonAsync(`import db_worker; db_worker.save_file('/data/${fileData.fileName}', """${fileData.fileContent}""")`);
      }
    } catch (error) {
      console.error(`Error importing file ${fileData.fileName}:`, error);
      setStatus(`Failed to import ${fileData.fileName}`);
    }
  }
  await new Promise<void>((resolve, reject) => {
    pyodide.FS.syncfs(false, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
  setStatus('Files imported successfully.');
}