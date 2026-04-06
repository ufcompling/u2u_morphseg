import { syncPyodideFS } from '../pyodide/pyodideService';
declare const pyodide: any;
declare const language: string;
export async function saveFile(filePath: string, content: string | Uint8Array): Promise<void> {
  try {
    // Write directly via the Emscripten FS so the content is never interpolated
    // into a Python string literal. The old `"""${content}"""` approach caused
    // Python to re-interpret escape sequences (e.g. \n, \", \u…) in the
    // content, corrupting JSON files like cycles.json on every subsequent read.
    if (!pyodide?.FS?.writeFile) {
      throw new Error("pyodide.FS.writeFile is not available in this environment (are you running in Node.js/bun instead of Pyodide?)");
    }
    const bytes =
      content instanceof Uint8Array
        ? content
        : new TextEncoder().encode(content);

    // Ensure parent directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir) {
      try {
        pyodide.FS.mkdirTree(dir);
      } catch {
        // directory already exists — ignore
      }
    }

    pyodide.FS.writeFile(filePath, bytes);
    await syncPyodideFS();
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}