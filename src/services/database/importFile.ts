// Used Copilot's autofill
import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;


export async function importFile(fileName: string, fileContent: string | Uint8Array): Promise<void> {
  if (!language) {
    console.error('Language not set. Cannot import file.');
    return;
  }
  // Ensure the language directory exists
  await pyodide.runPythonAsync(`import os; os.makedirs('/data/${language}', exist_ok=True)`);

  // Always overwrite — never skip if file exists. The old guard caused stale
  // IDBFS content to persist across sessions, making training operate on the
  // wrong file contents even after the user re-uploaded corrected files.
  try {
    const filePath = `/data/${language}/${fileName}`;
    if (fileContent instanceof Uint8Array) {
      pyodide.globals.set('data_bytes', fileContent);
      await pyodide.runPythonAsync(
        `import db_worker; db_worker.save_binary('${filePath}', data_bytes)`
      );
      await pyodide.runPythonAsync("globals().pop('data_bytes', None)");
    } else if (typeof fileContent === 'string') {
      pyodide.globals.set('text_data', fileContent);
      await pyodide.runPythonAsync(
        `import db_worker; db_worker.save_text('${filePath}', text_data)`
      );
      await pyodide.runPythonAsync("globals().pop('text_data', None)");
    }
  } catch (error) {
    console.error(`Error importing file ${fileName}:`, error);
  }
  await syncPyodideFS();
}