/* =============================================================================
 * FILE LIST - Shows All Uploaded Files
 * ============================================================================= */

import { useState, useRef } from "react";
import type { fileData } from "../../../services/database/dataHelpers";
import { FileIcon } from "../../../components/ui/icons";
import { FileCard } from "./FileCard";

interface FileListSectionProps {
  files: fileData[];
  processingFileId: number | null;
  onView: (id: number) => void;
  onProcess: (id: number) => void;
  onDelete: (id: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function FileListSection({
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