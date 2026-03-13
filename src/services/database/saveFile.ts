import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;
export async function saveFile(filename: string, content: string): Promise<void> {
  try {
    await pyodide.runPythonAsync(`import db_worker; db_worker.save_file('/data/${language}/${filename}', """${content}""") `);
    await syncPyodideFS(); 
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}