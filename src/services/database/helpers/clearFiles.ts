import { syncPyodideFS } from "../../pyodide/pyodideService";

export async function clearFiles(pyodide: any, directory: string = '/data'): Promise<void> {
  const dir = directory || '/data';
  await pyodide.runPythonAsync(`import db_worker; db_worker.clear_files('${dir}')`);
  await syncPyodideFS(pyodide);
}