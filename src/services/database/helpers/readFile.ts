export async function readFile(pyodide: any, fileName: string, suppressNotFound = false): Promise<{fileName: string; fileContent: string; fileType: 'text' | 'binary'}> {
  try {
    const jsonStr = await pyodide.runPythonAsync(`import db_worker; db_worker.read_file('/data/${fileName}')`);
    const parsed = JSON.parse(jsonStr);
    if (parsed.type === 'text') {
      return {fileName, fileContent: parsed.content, fileType: 'text'};
    }
    // Binary content: return base64 string (UI or download helpers can decode)
    return { fileName, fileContent: parsed.content, fileType: 'binary'};
  } catch (error: any) {
    const isNotFound = error && typeof error.message === 'string' && error.message.includes('FileNotFoundError');
    if (isNotFound) {
      if (suppressNotFound) {
        return false as any; // Caller can check for false to handle "not found" case
      }
      console.warn(`File not found: ${fileName}`);
      throw error;
    }
    console.error('Error reading file:', error);
    throw error;
  }
}