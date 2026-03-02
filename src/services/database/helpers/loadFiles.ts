import { type fileData } from "./dataHelpers";
import { readFile } from './readFile';

export async function loadFiles(pyodide: any): Promise<fileData[]> {
  if (!pyodide) {
    console.warn('loadFiles called before Pyodide initialized');
    return [];
  }
  const fileIdsStr = await pyodide.runPythonAsync(`import os; import json; json.dumps(os.listdir('/data'))`);
  const fileIds = JSON.parse(fileIdsStr).filter((name: string) => !name.startsWith('processed_'));
  const allFiles = await Promise.all(
    fileIds.map(async (fileName: string) => {
      try {
        const read = await readFile(pyodide, fileName, true);
        const size = read.fileType === 'binary'
          ? Math.ceil((read.fileContent.length * 3) / 4) - (read.fileContent.endsWith('==') ? 2 : read.fileContent.endsWith('=') ? 1 : 0)
          : read.fileContent.length;

          const proc = await readFile(pyodide, `processed_${fileName}`, true);
          const processedFileContent: string | undefined = proc?.fileContent;
        return {
          fileName: read.fileName,
          fileContent: read.fileContent,
          fileType: read.fileType,
          fileSize: size,
          processedFileContent: processedFileContent,
        } as fileData;
      }
      catch (error) {
        console.error(`Error loading file ${fileName}:`, error);
        return null;
      }
    })
  );
  return allFiles.filter((f): f is fileData => f !== null);
} 