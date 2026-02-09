/* =============================================================================
 * NOT NEEDED ANYMORE
 * ============================================================================= */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Dexie from 'dexie';
import { mapData, type rawData, type fileData } from '../services/database/dataHelpers';
import { TurtleLogo } from './ui/turtle-logo';
import { TurtleShellBackground } from '../layouts/turtle-background';
import { CopyIcon, CheckIcon, DownloadIcon } from './ui/icons';

/* =============================================================================
 * DATABASE CONFIGURATION
 * ============================================================================= */

// We're using Dexie to wrap IndexedDB
// This gives us a clean interface for storing files entirely in the browser - no server needed.
// The user's data never leaves their machine, which is critical for working with endangered
// language data that may be culturally sensitive.
class FileDB extends Dexie {
  files!: Dexie.Table<fileData, number>;
  
  constructor() {
    super('FileDB');
    
    // The ++id means auto-increment primary key - Dexie handles the numbering for us
    // We index on filename, type, size, and createdAt so we can query/sort efficiently
    this.version(1).stores({
      files: '++id, filename, type, size, createdAt'
    });
  }
}

/* =============================================================================
 * MAIN FILE MANAGER COMPONENT
 * ============================================================================= */

export function FileManager() {
  
  // ─────────────────────────────────────────────────────────────────────────
  // State Setup
  // ─────────────────────────────────────────────────────────────────────────
  
  // Database connection - null until initialization completes
  const [db, setDb] = useState<FileDB | null>(null);
  
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
      try {
        // Step 1: Initialize IndexedDB
        const database = new FileDB();
        await database.open();
        setDb(database);
        setIndexedDBReady(true);
        
        setStatus('Loading Pyodide...');
        
        // Step 2: Load Pyodide runtime from CDN
        // This downloads ~6MB of WebAssembly, so it takes 2-3 seconds on first load
        // After that it's cached by the browser
        const pyodideModule = await (window as any).loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });
        setPyodide(pyodideModule);
        setPyodideReady(true);
        
        setStatus('Ready to import');
      } catch (error) {
        console.error('Initialization error:', error);
        setStatus('Initialization failed');
      }
    };
    
    initDB();
  }, []); // Empty deps array = run once on mount

  // ─────────────────────────────────────────────────────────────────────────
  // Load Files from Database
  // ─────────────────────────────────────────────────────────────────────────
  
  // Whenever the database connection changes, reload the file list
  // This also runs after uploads, deletes, and processing
  useEffect(() => {
    if (db) {
      loadFiles();
    }
  }, [db]);

  // Pull all files from IndexedDB and sort by newest first
  // We do this instead of maintaining state because multiple tabs could modify the database
  const loadFiles = async () => {
    if (!db) return;
    
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
    if (!db || !fileList || fileList.length === 0) return;

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
    if (!db || id === undefined || !pyodide) {
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
      const pythonCode = `
text: str = file_content
lines: list[str] = text.split('\\n')
'\\n'.join([line[::-1].upper() for line in lines])
      `;

      // Pass the file content into Python's global scope
      pyodide.globals.set('file_content', file.content);
      
      // Execute the Python code and get the result
      const result = pyodide.runPython(pythonCode);

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
    if (!db || id === undefined) return;
    
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
    if (!db || id === undefined) return;
    
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
      {/* Animated turtle shell gradient background */}
      <TurtleShellBackground />

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

/* =============================================================================
 * HEADER - Logo, Title, Status Indicators
 * ============================================================================= */

interface HeaderProps {
  pyodideReady: boolean;
  indexedDBReady: boolean;
  fileCount: number;
}

function Header({ pyodideReady, indexedDBReady, fileCount }: HeaderProps) {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-border/20 bg-secondary/5">
      <div className="flex items-center gap-4">
        {/* Logo container with subtle gradient */}
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center">
          <TurtleLogo className="w-6 h-6 text-primary" />
        </div>
        
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-base font-semibold tracking-tight text-foreground">
              turtleshell
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-secondary/30 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
              v1.0
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/50 mt-0.5">
            {fileCount} {fileCount === 1 ? "file" : "files"} stored
          </p>
        </div>
      </div>

      {/* Status indicators - show when Pyodide and IndexedDB are ready */}
      <div className="flex items-center gap-3">
        <StatusIndicator label="py" isReady={pyodideReady} />
        <StatusIndicator label="db" isReady={indexedDBReady} />
      </div>
    </header>
  );
}

// Small status dot that pulses red when not ready, turns green when ready
function StatusIndicator({ label, isReady }: { label: string; isReady: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      <span className="font-mono text-[9px] text-muted-foreground/40 uppercase">{label}</span>
    </div>
  );
}

/* =============================================================================
 * UPLOAD SECTION - Drag-and-Drop or File Picker
 * ============================================================================= */

interface UploadSectionProps {
  onUpload: (files: FileList | null) => void;
  isUploading: boolean;
}

function UploadSection({ onUpload, isUploading }: UploadSectionProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Drag-and-drop handlers
  // We use useCallback to avoid recreating these functions on every render
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      onUpload(e.dataTransfer.files);
    },
    [onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <section className="px-6 py-5 border-b border-border/30">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`group flex items-center gap-5 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/30 hover:border-primary/50 hover:bg-secondary/5"
        }`}
      >
        {/* Hidden file input - clicking the label triggers this */}
        <input
          type="file"
          multiple
          onChange={(e) => onUpload(e.target.files)}
          className="hidden"
          accept=".csv,.txt,.tsv,.json,.pdf,.docx,.odt"
        />

        {/* Upload icon with rotation animation on drag */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isDragOver 
              ? "bg-primary/20 rotate-6" 
              : "bg-secondary/15 group-hover:bg-primary/10 group-hover:-rotate-3"
          }`}
        >
          <UploadIcon
            className={`w-6 h-6 transition-all duration-300 ${
              isDragOver ? "text-primary scale-110" : "text-muted-foreground/40 group-hover:text-primary/70"
            }`}
          />
        </div>

        {/* Text content */}
        <div className="flex-1">
          <p className="font-mono text-sm font-medium text-foreground">
            {isUploading ? "Uploading..." : "Add files"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/40 mt-0.5">
            Drag and drop or click to browse
          </p>
        </div>

        {/* Supported file types indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-muted-foreground/40 font-mono text-[10px] uppercase tracking-wider">
          <span>.txt</span>
          <span className="text-border/50">|</span>
          <span>.csv</span>
          <span className="text-border/50">|</span>
          <span>.json</span>
        </div>
      </label>
    </section>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 4v12m0-12L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
      />
    </svg>
  );
}

/* =============================================================================
 * FILE LIST - Shows All Uploaded Files
 * ============================================================================= */

interface FileListSectionProps {
  files: fileData[];
  processingFileId: number | null;
  onView: (id: number) => void;
  onProcess: (id: number) => void;
  onDelete: (id: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function FileListSection({
  files,
  processingFileId,
  onView,
  onProcess,
  onDelete,
  onReorder,
}: FileListSectionProps) {
  
  // Drag-and-drop state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Counter to handle nested drag events properly
  // (dragEnter/dragLeave fire multiple times when hovering over child elements)
  const dragCounter = useRef(0);

  // ─────────────────────────────────────────────────────────────────────────
  // Drag Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    dragCounter.current++;
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Required to allow drop
  };

  const handleDrop = (toIndex: number) => {
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      onReorder(draggedIndex, toIndex);
    }
    // Reset drag state
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  };

  const handleDragEnd = () => {
    // Clean up if user drags outside the list
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Empty State
  // ─────────────────────────────────────────────────────────────────────────

  if (files.length === 0) {
    return (
      <section className="py-20 px-6">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary/10 to-transparent border border-border/10 flex items-center justify-center mx-auto mb-5">
            <FileIcon className="w-9 h-9 text-muted-foreground/15" />
          </div>
          <p className="font-mono text-base text-muted-foreground/30 font-medium">
            No files yet
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/20 mt-1.5">
            Drop files above to get started
          </p>
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // File List Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <section className="max-h-[400px] overflow-y-auto">
      <div className="grid gap-2 p-4">
        {files.map((file, index) => (
          <FileCard
            key={file.id}
            file={file}
            index={index}
            isProcessing={processingFileId === file.id}
            isDragging={draggedIndex === index}
            isDragOver={dragOverIndex === index}
            onView={() => file.id && onView(file.id)}
            onProcess={() => file.id && onProcess(file.id)}
            onDelete={() => file.id && onDelete(file.id)}
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </section>
  );
}

/* =============================================================================
 * FILE CARD - Individual File Row
 * ============================================================================= */

interface FileCardProps {
  file: fileData;
  index: number;
  isProcessing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onView: () => void;
  onProcess: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function FileCard({
  file,
  isProcessing,
  isDragging,
  isDragOver,
  onView,
  onProcess,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDragEnd,
}: FileCardProps) {
  
  // ─────────────────────────────────────────────────────────────────────────
  // Helper Functions
  // ─────────────────────────────────────────────────────────────────────────
  
  // Format file size in human-readable format
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Extract file extension for the icon
  const getFileExtension = (name: string) => {
    return name.split(".").pop()?.toLowerCase() || "txt";
  };

  const extension = getFileExtension(file.filename);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative p-4 rounded-xl border transition-all duration-300 cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-30 scale-[0.98] border-border/10 bg-card/30 rotate-1"
          : isDragOver
            ? "border-primary/60 bg-primary/5 scale-[1.01] shadow-lg shadow-primary/5"
            : "border-transparent bg-secondary/5 hover:bg-secondary/10 hover:border-border/20 hover:shadow-md hover:shadow-black/5"
      }`}
    >
      {/* Drop indicator line - shows where the file will land */}
      {isDragOver && (
        <div className="absolute -top-0.5 left-6 right-6 h-0.5 bg-primary rounded-full shadow-lg shadow-primary/50" />
      )}

      <div className="flex items-center gap-4">
        {/* Drag handle (six dots) - only visible on hover */}
        <div className="opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity">
          <DragHandle />
        </div>

        {/* File type icon */}
        <FileTypeIcon extension={extension} />

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="font-mono text-sm font-medium text-foreground truncate">
              {file.filename}
            </p>
            {/* "DONE" badge if file has been processed */}
            {file.processedContent && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 font-mono text-[8px] text-primary font-semibold uppercase tracking-widest">
                done
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground/40 mt-1">
            {formatSize(file.size)}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* View button */}
          <button
            onClick={onView}
            className="p-2.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-secondary/20 transition-all"
            aria-label="View file"
          >
            <ViewIcon className="w-4 h-4" />
          </button>

          {/* Delete button */}
          <button
            onClick={onDelete}
            className="p-2.5 rounded-lg text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
            aria-label="Delete file"
          >
            <DeleteIcon className="w-4 h-4" />
          </button>

          {/* Process/Run button */}
          <button
            onClick={onProcess}
            disabled={isProcessing}
            className="ml-3 flex items-center gap-2.5 pl-4 pr-5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-mono text-[11px] font-semibold tracking-wide transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none group/btn"
          >
            {isProcessing ? (
              <>
                <SpinnerIcon className="w-4 h-4" />
                <span>Running</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-md bg-primary/20 group-hover/btn:bg-primary-foreground/20 flex items-center justify-center transition-colors">
                  <ProcessIcon className="w-2.5 h-2.5" />
                </div>
                <span>Run</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
 * FILE VIEWER MODAL - Full-Screen File Content Viewer
 * ============================================================================= */

interface FileViewerProps {
  file: fileData;
  onClose: () => void;
}

function FileViewer({ file, onClose }: FileViewerProps) {
  
  // Show processed content by default if it exists
  const [showProcessed, setShowProcessed] = useState(!!file.processedContent);
  const [copied, setCopied] = useState(false);
  
  // Determine which content to display
  const content =
    showProcessed && file.processedContent
      ? file.processedContent
      : file.content;

  // ─────────────────────────────────────────────────────────────────────────
  // File Stats Calculation
  // ─────────────────────────────────────────────────────────────────────────

  const getFileExtension = (name: string) => {
    return name.split(".").pop()?.toLowerCase() || "";
  };

  const extension = getFileExtension(file.filename);
  const lines = content.split("\n");
  const lineCount = lines.length;
  const charCount = content.length;
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  // Copy content to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download file with processed_ prefix if viewing processed content
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = showProcessed ? `processed_${file.filename}` : file.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-card/98 backdrop-blur-xl border border-border/30 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header - File info and close button */}
        <header className="px-6 py-4 border-b border-border/20 bg-secondary/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileTypeIcon extension={extension} />
              <div>
                <h2 className="font-mono text-base font-semibold text-foreground">
                  {file.filename}
                </h2>
                {/* File statistics */}
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-[10px] text-muted-foreground/40">
                    {lineCount} lines
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border/50" />
                  <span className="font-mono text-[10px] text-muted-foreground/40">
                    {wordCount.toLocaleString()} words
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border/50" />
                  <span className="font-mono text-[10px] text-muted-foreground/40">
                    {charCount.toLocaleString()} chars
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-secondary/30 transition-all"
              aria-label="Close viewer"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Toolbar - Toggle original/processed, copy, download */}
        <div className="px-6 py-3 border-b border-border/10 flex items-center justify-between bg-secondary/3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Only show toggle if file has been processed */}
            {file.processedContent && (
              <div className="flex items-center bg-secondary/20 rounded-lg p-0.5">
                <button
                  onClick={() => setShowProcessed(false)}
                  className={`px-4 py-2 rounded-md font-mono text-[11px] font-medium transition-all ${
                    !showProcessed
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setShowProcessed(true)}
                  className={`px-4 py-2 rounded-md font-mono text-[11px] font-medium transition-all ${
                    showProcessed
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  Processed
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/20 transition-all font-mono text-[11px]"
            >
              {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/20 transition-all font-mono text-[11px]"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* Content area - Line numbers + code */}
        <div className="flex-1 overflow-auto bg-background/30">
          <div className="flex min-h-full">
            {/* Line numbers column */}
            <div className="sticky left-0 shrink-0 py-5 px-4 bg-secondary/5 border-r border-border/10 select-none">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className="font-mono text-[12px] text-muted-foreground/20 text-right leading-7 tabular-nums w-8"
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Content column */}
            <div className="flex-1 py-5 px-6 overflow-x-auto">
              <pre className="font-mono text-[13px] text-foreground/90 leading-7 whitespace-pre">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className="hover:bg-primary/5 -mx-6 px-6 transition-colors"
                  >
                    {line || " "}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer - File type and cursor position */}
        <footer className="px-6 py-2.5 border-t border-border/10 bg-secondary/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">
                {extension || "txt"}
              </span>
              {showProcessed && file.processedContent && (
                <span className="px-2 py-0.5 rounded bg-primary/15 font-mono text-[9px] text-primary uppercase tracking-wider">
                  viewing processed
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground/30">
              Ln {lineCount}, Col 1
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* =============================================================================
 * ICON COMPONENTS
 * ============================================================================= */

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function ViewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function ProcessIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function DeleteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// Six-dot drag handle icon
function DragHandle() {
  return (
    <div className="flex flex-col gap-[3px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors px-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-[3px]">
          <div className="w-[3px] h-[3px] rounded-full bg-current" />
          <div className="w-[3px] h-[3px] rounded-full bg-current" />
        </div>
      ))}
    </div>
  );
}

// File type badge with color coding
function FileTypeIcon({ extension }: { extension: string }) {
  // Color scheme for different file types
  const config: Record<string, { bg: string; text: string }> = {
    js: { bg: "bg-yellow-500/15", text: "text-yellow-500" },
    ts: { bg: "bg-blue-500/15", text: "text-blue-400" },
    py: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
    json: { bg: "bg-orange-500/15", text: "text-orange-400" },
    md: { bg: "bg-purple-500/15", text: "text-purple-400" },
    css: { bg: "bg-pink-500/15", text: "text-pink-400" },
    html: { bg: "bg-red-500/15", text: "text-red-400" },
    txt: { bg: "bg-secondary/30", text: "text-muted-foreground" },
    csv: { bg: "bg-green-500/15", text: "text-green-400" },
  };

  const { bg, text } = config[extension] || config.txt;

  return (
    <div
      className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}
    >
      <span className={`font-mono text-[10px] font-bold uppercase ${text}`}>
        {extension.slice(0, 3)}
      </span>
    </div>
  );
}