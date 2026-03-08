import { syncPyodideFS } from "../pyodide/pyodideService";
declare const pyodide: any;
export async function clearFiles(directory: string = '/data'): Promise<void> {
  const dir = directory || '/data';
  await pyodide.runPythonAsync(`import db_worker; db_worker.clear_files('${dir}')`);
  await syncPyodideFS();
}