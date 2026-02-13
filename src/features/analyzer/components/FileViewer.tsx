/* =============================================================================
 * FILE VIEWER MODAL - Full-Screen File fileContent Viewer
 * ============================================================================= */

import { useState } from "react";
import { FileTypeIcon, CloseIcon, CheckIcon, CopyIcon, DownloadIcon } from "../../../components/ui/icons";
import type { fileData } from "../../../services/database/helpers/dataHelpers";

interface FileViewerProps {
  file: fileData;
  onClose: () => void;
}

export function FileViewer({ file, onClose }: FileViewerProps) {
  
  // Show processed fileContent by default if it exists
  const [showProcessed, setShowProcessed] = useState(!!file.processedFileContent);
  const [copied, setCopied] = useState(false);
  
  // Determine which fileContent to display
  const fileContent =
    showProcessed && file.processedFileContent
      ? file.processedFileContent
      : file.fileContent;

  // ─────────────────────────────────────────────────────────────────────────
  // File Stats Calculation
  // ─────────────────────────────────────────────────────────────────────────

  const getFileExtension = (name: string) => {
    return name.split(".").pop()?.toLowerCase() || "";
  };

  const extension = getFileExtension(file.fileName);
  const lines = fileContent.split("\n");
  const lineCount = lines.length;
  const charCount = fileContent.length;
  const wordCount = fileContent.split(/\s+/).filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  // Copy fileContent to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download file with processed_ prefix if viewing processed fileContent
  const handleDownload = () => {
    const blob = new Blob([fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = showProcessed ? `processed_${file.fileName}` : file.fileName;
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

      {/* Modal fileContent */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-card/98 backdrop-blur-xl border border-border/30 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header - File info and close button */}
        <header className="px-6 py-4 border-b border-border/20 bg-secondary/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileTypeIcon extension={extension} />
              <div>
                <h2 className="font-mono text-base font-semibold text-foreground">
                  {file.fileName}
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
            {file.processedFileContent && (
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

        {/* fileContent area - Line numbers + code */}
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

            {/* fileContent column */}
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
              {showProcessed && file.processedFileContent && (
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
