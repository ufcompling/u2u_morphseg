declare const pyodide: any;

export async function readFile(filePath: string): Promise<{ fileContent: string; fileType: 'text' | 'pdf' | 'docx' }> {
  try {
    // Read file from Python db_worker
    const fileContentRaw = await pyodide.runPythonAsync(`import db_worker; db_worker.read_file('${filePath}')`);
    const fileObj = JSON.parse(fileContentRaw);
    if (fileObj.type === 'text') {
      return { fileContent: fileObj.content, fileType: 'text' };
    }
    const bytes = new Uint8Array(fileObj.content);
    const header = String.fromCharCode(...bytes.slice(0, 4));

    if (header.startsWith('%PDF')) {
      pyodide.globals.set('data_bytes', bytes);
      const pdfText = await pyodide.runPythonAsync(`import binary_extractor; result = binary_extractor.pdfExtractor(bytes(data_bytes)); str(result)`);
      await pyodide.runPythonAsync("globals().pop('data_bytes', None)");
      return { fileContent: pdfText, fileType: 'pdf' };

    } else if (header.startsWith('PK')) {
      pyodide.globals.set('data_bytes', bytes);
      const docxText = await pyodide.runPythonAsync(`import binary_extractor; result = binary_extractor.docxExtractor(bytes(data_bytes)); str(result)`);
      await pyodide.runPythonAsync("globals().pop('data_bytes', None)");
      return { fileContent: docxText, fileType: 'docx' };
    }

    console.error('[readFile] unsupported file type header', { header });
    throw new Error(`Unsupported file type for file ${filePath}`);
  } catch (err: any) {
    const isNotFound = err?.message && (
      err.message.includes('FileNotFoundError') ||
      err.message.includes('not found in /data') ||
      err.message.includes('No such file or directory') ||
      err.message.includes('does not exist') ||
      err.message.includes('File not found')
    );
    // For well-known init files that simply may not exist yet, return empty content silently
    const knownInitFiles = ['project.json', 'cycles.json', 'annotations.json'];
    if (isNotFound && knownInitFiles.some(f => filePath.endsWith('/' + f))) {
      return { fileContent: '', fileType: 'text' };
    }
    console.error('[readFile] ERROR', err);
    if (isNotFound) {
      throw new Error(`File not found: ${filePath}`);
    }
    throw err;
  }
}