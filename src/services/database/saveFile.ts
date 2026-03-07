import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;

export async function saveFile(filename: string, content: string): Promise<void> {
  try {
    await pyodide.runPythonAsync(`import db_worker; db_worker.save_file('/data/${filename}', """${content}""") `);
    await syncPyodideFS(pyodide); 
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}