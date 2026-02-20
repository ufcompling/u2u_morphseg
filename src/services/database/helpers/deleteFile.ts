export async function deleteFile(pyodide: any, fileName: string): Promise<void> {
  await pyodide.runPythonAsync(`import db_worker; db_worker.delete_file('/data/${fileName}')`);
  await new Promise<void>((resolve, reject) => {
    pyodide.FS.syncfs(false, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}