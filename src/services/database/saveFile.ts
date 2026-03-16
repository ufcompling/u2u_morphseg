import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;
export async function saveFile(filePath: string, content: string | Uint8Array): Promise<void> {
  try {
    if (content instanceof Uint8Array) {
      // Handle binary content
      await pyodide.runPythonAsync(`import db_worker; db_worker.save_binary('${filePath}', ${content})`);
    } else {
      // Handle string content
      await pyodide.runPythonAsync(`import db_worker; db_worker.save_text('${filePath}', """${content}""")`);
    }
    await syncPyodideFS(); 
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}