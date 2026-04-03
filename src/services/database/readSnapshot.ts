import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;

// Restores all files in the snapshot JSON back into the language directory.
export async function readSnapshot(snapshotJson: string): Promise<void> {
  if (!language) {
    throw new Error('Language not set. Cannot restore snapshot.');
  }
  pyodide.globals.set('_snapshot_json', snapshotJson);
  await pyodide.runPythonAsync(
    `import db_worker; db_worker.read_snapshot(_snapshot_json, '/data/${language}')`
  );
  await pyodide.runPythonAsync("globals().pop('_snapshot_json', None)");
  await syncPyodideFS();
}