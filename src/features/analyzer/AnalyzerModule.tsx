import { useState, useEffect } from "react";
import { type fileData } from "../../services/database/helpers/dataHelpers";
import { FileListSection } from "./components/FileListSection";
import { FileViewer } from "./components/FileViewer";
import { Header } from "./components/Header";
import { UploadSection } from "./components/UploadSection";
import { initPyodide, getPyodide, runPythonCode } from "../../services/pyodide/pyodideService";
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
  const [processingFileName, setProcessingFileName] = useState<string | null>(null);
  
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
      await initPyodide();
      setPyodide(getPyodide());
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
    if (!pyodide) return;

    (async () => {
      try {
        const loadedFiles = await loadFiles(pyodide);
        setFiles(loadedFiles);
      } catch (error) {
        console.error('Error loading files:', error);
        setFiles([]);
      }
    })();
  }, [pyodide]);

  // ─────────────────────────────────────────────────────────────────────────
  // File Upload Handler
  // ─────────────────────────────────────────────────────────────────────────
  
  // Handles files from both drag-and-drop and file picker
  // We read each file, check for duplicates, then bulk insert into IndexedDB
  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    // Defensive check for pyodide
    if (!pyodide || !pyodideReady) {
      setStatus('Python environment not ready. Please wait...');
      return;
    }

    setIsUploading(true);
    setStatus('Importing files...');

    try {
      await importFiles(pyodide, fileList, setStatus);
      setStatus('Files imported successfully');
      const updatedFiles = await loadFiles(pyodide);
      setFiles(updatedFiles);

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
  const handleProcess = async (fileName: string | undefined) => {
    const files = await loadFiles(pyodide);
    const file = files.find((f) => f.fileName === fileName);
    if (!file) return;
    setProcessingFileName(file.fileName);
    setStatus(`Processing file: ${file.fileName}`);

    try {
      // TODO: Replace this demo code with actual CRF morphological segmentation
      // For now, this just reverses and uppercases each line to prove the pipeline works
      // Pass the file content into Python's global scope
      pyodide.globals.set('file_content', file.fileContent);
      
      // Execute the Python code and get the result
      const result = await runPythonCode(pyodide, file.fileContent, '', 'process_data');

      // Store the processed result back in the database
      // This way users can view both original and processed versions
      await saveFile(pyodide, file.fileName, result);

      setStatus(`Processing completed for: ${file.fileName}`);
      await loadFiles(pyodide);
      
      // If the user has this file open in the viewer, refresh it
      if (selectedFile?.fileName === file.fileName) {
        const updated = await loadFiles(pyodide);
        setSelectedFile(updated.find(f => f.fileName === file.fileName) || null);
      }
    } catch (error) {
      console.error('Processing error:', error);
      setStatus('Processing failed');
    } finally {
      setProcessingFileName(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Deletion
  // ─────────────────────────────────────────────────────────────────────────
  
  // Remove a file from IndexedDB
  // If the file is currently open in the viewer, close the viewer
  // Remove a file from IndexedDB
  // If the file is currently open in the viewer, close the viewer
  const handleDelete = async (fileName: string | undefined) => {
    if (!pyodideReady || !fileName) return;
    try {
      await deleteFile(pyodide, fileName);
      try {        await deleteFile(pyodide, `processed_${fileName}`); } catch {} // Ignore if processed version doesn't exist
      const updatedFiles = await loadFiles(pyodide);
      setFiles(updatedFiles);
      
      // Close the viewer if we just deleted the file being viewed
      if (selectedFile?.fileName === fileName) {
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
const handleView = async (fileName: string | undefined) => {
  if (!fileName || !pyodide) return;
  try {
    const contentObj = await readFile(pyodide, fileName);
    if (!contentObj) {
      setStatus('Failed to load file');
      return;
    }
    const metaData = files.find(f => f.fileName === fileName);
    if (!metaData) {
      // Fallback: minimal fileData (assume text)
      setSelectedFile({
        fileName,
        fileContent: contentObj.fileContent,
        fileType: 'text',
      } as fileData);
      return;
    }
    const fileData: fileData = {
      fileName: metaData.fileName,
      fileContent: contentObj.fileContent,
      fileType: metaData.fileType,
      fileSize: metaData.fileSize,
      createdAt: metaData.createdAt,
      processedFileContent: metaData.processedFileContent,
    };
    setSelectedFile(fileData);
  } catch (error) {
    console.error('Error loading file for viewing:', error);
    setStatus('Failed to load file');
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
            processingFileName={processingFileName}
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