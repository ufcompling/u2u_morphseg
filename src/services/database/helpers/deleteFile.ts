import { syncPyodideFS } from "../../pyodide/pyodideService";

export async function deleteFile(pyodide: any, filePath: string): Promise<void> {
  await pyodide.runPythonAsync(`import db_worker; db_worker.delete_file('/${filePath}')`);
  await syncPyodideFS(pyodide);
}