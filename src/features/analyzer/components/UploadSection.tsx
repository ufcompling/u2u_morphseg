/* =============================================================================
 * UPLOAD SECTION - Drag-and-Drop or File Picker
 * ============================================================================= */

import { useState, useCallback } from "react";
import { UploadIcon } from "../../../components/ui/icons";

interface UploadSectionProps {
  onUpload: (files: FileList | null) => void;
  isUploading: boolean;
}

export function UploadSection({ onUpload, isUploading }: UploadSectionProps) {
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


