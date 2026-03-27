import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;

// Runs inside the web worker — no DOM access. Returns the snapshot JSON string
// so the worker can post it back to the main thread, where the actual download
// is triggered by the browser API.
export async function downloadSnapshot(): Promise<string> {
  if (!language) {
    throw new Error('Language not set. Cannot download snapshot.');
  }
  await syncPyodideFS();
  const snapshot: string = pyodide.runPython(`import db_worker; db_worker.get_snapshot('/data/${language}')`);
  return snapshot;
}