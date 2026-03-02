import { syncPyodideFS } from "../../pyodide/pyodideService";

export async function deleteFile(pyodide: any, fileName: string): Promise<void> {
  await pyodide.runPythonAsync(`import db_worker; db_worker.delete_file('/data/${fileName}')`);
  await syncPyodideFS(pyodide);
}