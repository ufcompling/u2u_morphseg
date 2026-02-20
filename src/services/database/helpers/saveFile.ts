export async function saveFile(pyodide: any, filename: string, content: string): Promise<void> {
  try {
    await pyodide.runPythonAsync(`import db_worker; db_worker.save_file('/data/${filename}', """${content}""") `);
    await new Promise<void>((resolve, reject) => {
      pyodide.FS.syncfs(false, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });  
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}