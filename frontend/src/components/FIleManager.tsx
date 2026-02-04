// I'm watching you Evan...
// Didn't have Grok write the code, but did use it for ideas.
// Idk if this is necessary, but here it is.
import React, { useState, useEffect, type JSX } from 'react';
import Dexie from 'dexie';
import {mapData, type rawData, type fileData} from '../utils/dataHelpers';

// Database class
class FileDB extends Dexie {
  files!: Dexie.Table<fileData, number>;
  constructor() {
    super('FileDB');
    this.version(1).stores({
      files: '++id, filename, type, size'
    });
  }
}
const FileManager = (): JSX.Element => {
  const [db, setDb] = useState<FileDB | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>('');
  const [storedFiles, setStoredFiles] = useState<fileData[]>([]);
  const [pyodide, setPyodide] = useState<any>(null);

  // Initialize database
  useEffect(() => {
    const initDB = async () => {
      const database = new FileDB();
      await database.open();
      setDb(database);

      setStatus('Loading Pyodide')
      const pyodideModule = await (window as any).loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
      });
      setPyodide(pyodideModule);

      setStatus('Ready to Import');
    };
    initDB();
  }, []);
  
  useEffect(() => {
    if (db) {
      loadFiles();
    }
  }, [db]);

  // Load files from db
  const loadFiles = async () => {
    if (!db) return;
    const allFiles = await db.files.toArray();
    setStoredFiles(allFiles);
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(file => file.type === 'text/plain' || file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/vnd.oasis.opendocument.text');
      setFiles(validFiles);
    }
  };

  // Import files into db
  const importFiles = async () => {
    if (!db) {
      setStatus('Import Failed');
      return;
    }
    setStatus('Importing Files...');
    const duplicates: string[] = [];
    const existingFilenames = new Set((await db.files.toArray()).map(file => file.filename));
    for (const file of files) {
      if (existingFilenames.has(file.name)) {
        duplicates.push(file.name);
      }
    }
    if (duplicates.length > 0) {
      setStatus(`Import Failed: Duplicate files - ${duplicates.join(', ')}`);
      return;
    }
    const rawDataArray: rawData[] = [];
    for (const file of files) {
      let content: string | Uint8Array;
      if (file.type.startsWith('text/')) {
        content = await file.text();
      } else {
        const arrayBuffer = await file.arrayBuffer();
        content = new Uint8Array(arrayBuffer);
      }
      // Add raw data
      rawDataArray.push({
        filename: file.name,
        content,
        size: file.size,
        type: file.type,
      });
    }

    // Map rawData to fileData
    const mappedData = mapData(rawDataArray);
    await db.files.bulkAdd(mappedData);
    setStatus('Import Completed');
    console.log(mappedData);
    await loadFiles();
  };

  const pyodideProcessFile = async (id: number | undefined) => {
    if (!db || id === undefined || !pyodide) return;
    const file = await db.files.get(id);

    if (!file || typeof file.content !== 'string') {
      console.log('File not found or unsupported content type');
     return; 
    }
    setStatus(`Processing file: ${file.filename}`);

    const pythonCode = `
  text: str = file_content
  lines: list[str] = text.split('\\n')
  '\\n'.join([line[::-1].upper() for line in lines])` // Perform some dummy processing (reverse and uppercase each line)

    pyodide.globals.set('file_content', file.content);
    const result = pyodide.runPython(pythonCode);

    await db.files.add({
      filename: `processed_${file.filename}`,
      content: result,
      size: result.length,
      type: 'text/plain'
    });
    
    setStatus(`Processing completed for file: ${file.filename}`);
    await db.files.delete(id);
    await loadFiles();
  }

  // Will sort these, and restructure this file later.
  // cough cough evan cough cough
  const deleteFile = async (id: number | undefined) => {
    if (!db || id === undefined) return;
    await db.files.delete(id);
    await loadFiles();
  }
  const viewing = async (id: number | undefined) => {
    if (!db || id === undefined) return;
    console.log('Viewing file with id:', id);
    console.log('File content:', await db?.files.get(id));
  }
  // Render component, feel free to change
  return (
    <div>
      <h2>File Manager</h2>
      <input type="file" multiple accept=".txt,.pdf,.docx,.odt" onChange={handleFileChange} />
      <button onClick={importFiles}>Import Files</button>
      <p>Status: {status}</p>
      <h3>Stored Files</h3>
      <ul>
        {storedFiles.map(file => (
          <li key={file.id}>{file.filename} - {(file.size / (1024 * 1024)).toFixed(2)} Mb
            <button onClick={() => viewing(file.id)}>View</button>
            <button onClick={() => pyodideProcessFile(file.id)}>Process</button>
            <button onClick={() => deleteFile(file.id)}>Delete</button>
            
          </li> 
        ))}
      </ul>
    </div>
  )
};

export default FileManager;