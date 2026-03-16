import { syncPyodideFS } from "../pyodide/pyodideService";
declare const pyodide: any;

export async function deleteFile(filePath: string): Promise<void> {
  await pyodide.runPythonAsync(`import db_worker; db_worker.delete_file('${filePath}')`);
  await syncPyodideFS();
}