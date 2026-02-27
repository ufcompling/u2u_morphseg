import { syncPyodideFS } from "../../pyodide/pyodideService";

export async function clearFiles(pyodide: any): Promise<void> {
  await pyodide.runPythonAsync(`import db_worker; db_worker.clear_files('/data')`);
  await syncPyodideFS(pyodide);
}