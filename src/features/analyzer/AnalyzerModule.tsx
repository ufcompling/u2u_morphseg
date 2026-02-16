import { useState, useEffect } from "react";
import { type fileData } from "../../services/database/helpers/dataHelpers";
import { FileListSection } from "./components/FileListSection";
import { FileViewer } from "./components/FileViewer";
import { Header } from "./components/Header";
import { UploadSection } from "./components/UploadSection";
import { initPyodide, runPythonCode } from "../../services/pyodide/pyodideService";
import { loadFiles } from "../../services/database/helpers/loadFiles";
import { importFiles } from "../../services/database/helpers/importFiles";
import { saveFile } from "../../services/database/helpers/saveFile";
import { readFile } from "../../services/database/helpers/readFile";
import { deleteFile } from "../../services/database/helpers/deleteFile";


/* =============================================================================
 * MAIN FILE MANAGER COMPONENT (AnalyzerModule)
 * ============================================================================= */
export function AnalyzerModule() {
  
  // ─────────────────────────────────────────────────────────────────────────
  // State Setup
  // ─────────────────────────────────────────────────────────────────────────
  
  // All files currently in the database
  const [files, setFiles] = useState<fileData[]>([]);
  
  // The file being viewed in the modal (null = modal closed)
  const [selectedFile, setSelectedFile] = useState<fileData | null>(null);
  
  // Status messages for user feedback (prefixed with _ because we set it but don't display it yet)
  // Keeping this around for debugging and future status bar implementation
  const [_status, setStatus] = useState<string>('Initializing...');
  
  // Upload state tracking
  const [isUploading, setIsUploading] = useState(false);
  
  // Which file is currently being processed (null = none)
  const [processingFileId, setProcessingFileId] = useState<number | null>(null);
  
  // Pyodide runtime instance - this is the Python interpreter running in the browser
  const [pyodide, setPyodide] = useState<any>(null);
  
  // Status indicators for the header
  const [pyodideReady, setPyodideReady] = useState(false);
  const [indexedDBReady, setIndexedDBReady] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization - Run Once on Mount
  // ─────────────────────────────────────────────────────────────────────────
  
  // This effect runs once when the component mounts. We need to:
  // 1. Open the IndexedDB connection
  // 2. Load Pyodide (Python in the browser) from CDN
  // Both are async and take a few seconds, so we show loading indicators
  useEffect(() => {
    const initDB = async () => {
      setStatus('Loading database...');
      const pyodideInstance = await initPyodide();
      setPyodide(pyodideInstance);
      setPyodideReady(true);
        setIndexedDBReady(true);
        setStatus('Ready to import');
      }
      initDB();
    }, []); // Empty deps array = run once on mount

  // ─────────────────────────────────────────────────────────────────────────
  // Load Files from Database
  // ─────────────────────────────────────────────────────────────────────────
  
  // Whenever the database connection changes, reload the file list
  // This also runs after uploads, deletes, and processing
  useEffect(() => {
    if (indexedDBReady) {
      loadFiles();
    }
  }, [indexedDBReady]);

  // Pull all files from IndexedDB and sort by newest first
  // We do this instead of maintaining state because multiple tabs could modify the database
  const loadFiles = async () => {
    if (!indexedDBReady) return;
    
    try {
      const allFiles = await db.files.toArray();
      
      // Sort newest first - this makes the UI feel more responsive
      // since users typically care about their most recent uploads
      allFiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setFiles(allFiles);
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Upload Handler
  // ─────────────────────────────────────────────────────────────────────────
  
  // Handles files from both drag-and-drop and file picker
  // We read each file, check for duplicates, then bulk insert into IndexedDB
  const handleUpload = async (fileList: FileList | null) => {
    if (!indexedDBReady || !fileList || fileList.length === 0) return;

    setIsUploading(true);
    setStatus('Importing files...');

    try {
      const rawDataArray: rawData[] = [];
      
      // Check for duplicates by filename - we don't want users accidentally uploading
      // the same file twice and ending up with duplicate training data
      const existingFilenames = new Set(files.map(f => f.filename));
      const duplicates: string[] = [];

      for (const file of Array.from(fileList)) {
        if (existingFilenames.has(file.name)) {
          duplicates.push(file.name);
          continue;
        }

        // Read file content - we handle text and binary differently
        // Text files are easier to work with as strings
        // Binary files (PDF, DOCX) need to be stored as Uint8Array
        let content: string | Uint8Array;
        if (file.type.startsWith('text/') || file.type === 'application/json') {
          content = await file.text();
        } else {
          const arrayBuffer = await file.arrayBuffer();
          content = new Uint8Array(arrayBuffer);
        }

        rawDataArray.push({
          filename: file.name,
          content,
          size: file.size,
          type: file.type || 'text/plain',
        });
      }

      // If any duplicates were found, abort and tell the user
      if (duplicates.length > 0) {
        setStatus(`Import failed: Duplicate files - ${duplicates.join(', ')}`);
        setIsUploading(false);
        return;
      }

      // Map the raw data to our database schema (adds timestamps, etc.)
      const mappedData = mapData(rawDataArray);
      
      // Bulk insert is much faster than inserting one at a time
      await db.files.bulkAdd(mappedData);
      
      setStatus(`Import completed: ${mappedData.length} file(s) added`);
      await loadFiles();
    } catch (error) {
      console.error('Upload error:', error);
      setStatus('Import failed');
    } finally {
      setIsUploading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Processing with Pyodide
  // ─────────────────────────────────────────────────────────────────────────
  
  // This is where the magic happens - we run Python code on the file content
  // Currently just a demo (reverse + uppercase), but this will eventually call
  // the CRF model for morphological segmentation
  const handleProcess = async (id: number | undefined) => {
    if (!indexedDBReady || id === undefined || !pyodide) {
      setStatus('Processing unavailable');
      return;
    }

    const file = await db.files.get(id);
    if (!file || typeof file.content !== 'string') {
      setStatus('File not found or unsupported content type');
      return;
    }

    setProcessingFileId(id);
    setStatus(`Processing file: ${file.filename}`);

    try {
      // TODO: Replace this demo code with actual CRF morphological segmentation
      // For now, this just reverses and uppercases each line to prove the pipeline works

      // Pass the file content into Python's global scope
      pyodide.globals.set('file_content', file.content);
      
      // Execute the Python code and get the result
      const result = await runPythonCode(pyodide, file.content, './scripts/pycode.py', 'process_data');

      // Store the processed result back in the database
      // This way users can view both original and processed versions
      await db.files.update(id, {
        processedContent: result
      });

      setStatus(`Processing completed for: ${file.filename}`);
      await loadFiles();
      
      // If the user has this file open in the viewer, refresh it
      if (selectedFile?.id === id) {
        const updated = await db.files.get(id);
        setSelectedFile(updated || null);
      }
    } catch (error) {
      console.error('Processing error:', error);
      setStatus('Processing failed');
    } finally {
      setProcessingFileId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Deletion
  // ─────────────────────────────────────────────────────────────────────────
  
  // Remove a file from IndexedDB
  // If the file is currently open in the viewer, close the viewer
  const handleDelete = async (id: number | undefined) => {
    if (!indexedDBReady || id === undefined) return;
    
    try {
      await db.files.delete(id);
      await loadFiles();
      
      // Close the viewer if we just deleted the file being viewed
      if (selectedFile?.id === id) {
        setSelectedFile(null);
      }
      
      setStatus('File deleted');
    } catch (error) {
      console.error('Delete error:', error);
      setStatus('Delete failed');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Viewing
  // ─────────────────────────────────────────────────────────────────────────
  
  // Open the file viewer modal for a specific file
  const handleView = async (id: number | undefined) => {
    if (!indexedDBReady || id === undefined) return;
    
    try {
      const file = await db.files.get(id);
      setSelectedFile(file || null);
    } catch (error) {
      console.error('View error:', error);
    }
  };

  // Close the file viewer modal
  const handleCloseViewer = () => {
    setSelectedFile(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Drag-and-Drop Reordering
  // ─────────────────────────────────────────────────────────────────────────
  
  // Let users manually reorder files by dragging them
  // This doesn't persist to the database - it's just for visual organization
  // If you reload the page, it goes back to chronological order
  const handleReorder = (fromIndex: number, toIndex: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      const [movedFile] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, movedFile);
      return newFiles;
    });
  };

    // ─────────────────────────────────────────────────────────────────────────
    // Main UI Render
    // ─────────────────────────────────────────────────────────────────────────
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 relative">
      <main className="w-full max-w-3xl relative z-10">
        {/* Main card container with glassmorphism effect */}
        <div className="bg-card/98 backdrop-blur-3xl border border-border/20 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5">
          
          <Header
            pyodideReady={pyodideReady}
            indexedDBReady={indexedDBReady}
            fileCount={files.length}
          />

          <UploadSection onUpload={handleUpload} isUploading={isUploading} />

          <FileListSection
            files={files}
            processingFileId={processingFileId}
            onView={handleView}
            onProcess={handleProcess}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        </div>

        {/* Footer text */}
        <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground/25 tracking-widest uppercase">
          pyodide + indexeddb
        </p>
      </main>

      {/* File viewer modal - only renders when a file is selected */}
      {selectedFile && (
        <FileViewer file={selectedFile} onClose={handleCloseViewer} />
      )}
    </div>
  );
}