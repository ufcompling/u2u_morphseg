import { syncPyodideFS } from "../pyodide/pyodideService";
declare const pyodide: any;
declare const language: string;

export async function deleteFile(filePath: string): Promise<void> {
  console.log(`Deleting file: ${filePath}`);
  await pyodide.runPythonAsync(`import os; print("Current files before deletion:", os.listdir('/data/${language}'))`);
  await pyodide.runPythonAsync(`import db_worker; db_worker.delete_file('${filePath}')`);
  await syncPyodideFS();
}