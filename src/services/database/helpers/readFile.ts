export async function readFile(pyodide: any, filePath: string): Promise<{ fileContent: string; fileType: 'text' | 'pdf' | 'docx' }> {
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
  throw new Error(`Unsupported file type for file ${filePath}`);
}