/* =============================================================================
 * FILE CARD - Individual File Row
 * ============================================================================= */

import { DragHandle, FileTypeIcon, ViewIcon, DeleteIcon, SpinnerIcon, ProcessIcon } from "../../../components/ui/icons";
import type { fileData } from "../../../services/database/helpers/dataHelpers";

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

export function FileCard({
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

  const extension = getFileExtension(file.fileName);

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
              {file.fileName}
            </p>
            {/* "DONE" badge if file has been processed */}
            {file.processedFileContent && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 font-mono text-[8px] text-primary font-semibold uppercase tracking-widest">
                done
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground/40 mt-1">
            {formatSize(file.fileSize ?? 0)}
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