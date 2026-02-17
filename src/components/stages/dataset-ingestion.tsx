"use client";

import { useState, type DragEvent, type ChangeEvent } from "react";
import type { StoredFile, FileRole } from "../../lib/types";

// ============================================================
// Dataset Ingestion Stage
// Upload files, assign roles, view validation status
// ============================================================

interface DatasetIngestionProps {
  files: StoredFile[];
  onUpload: (fileList: FileList | null) => void;
  onAssignRole: (fileId: string, role: FileRole) => void;
  onRemoveFile: (fileId: string) => void;
  onNext: () => void;
  isUploading: boolean;
}

export function DatasetIngestion({
  files,
  onUpload,
  onAssignRole,
  onRemoveFile,
  onNext,
  isUploading,
}: DatasetIngestionProps) {
  const annotatedCount = files.filter((f) => f.role === "annotated").length;
  const unannotatedCount = files.filter((f) => f.role === "unannotated").length;
  const evaluationCount = files.filter((f) => f.role === "evaluation").length;
  const hasRequiredFiles = annotatedCount > 0 && unannotatedCount > 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Upload zone */}
      <UploadZone onUpload={onUpload} isUploading={isUploading} />

      {/* Role summary bar */}
      {files.length > 0 && (
        <div className="px-6 py-3 border-b border-border/20 bg-secondary/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <RoleCount label="Annotated" count={annotatedCount} color="text-primary" />
            <RoleCount label="Unannotated" count={unannotatedCount} color="text-foreground" />
            <RoleCount label="Evaluation" count={evaluationCount} color="text-muted-foreground" />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/40">
            {files.length} total
          </span>
        </div>
      )}

      {/* File list */}
      <div className="max-h-[320px] overflow-y-auto">
        {files.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border/10">
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                onAssignRole={onAssignRole}
                onRemove={onRemoveFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-border/20 flex items-center justify-between">
        <p className="font-mono text-[10px] text-muted-foreground/40 max-w-xs">
          {hasRequiredFiles
            ? "Ready to proceed"
            : "Assign at least one annotated and one unannotated file to continue"}
        </p>
        <button
          onClick={onNext}
          disabled={!hasRequiredFiles}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-mono text-xs font-semibold tracking-wide transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
        >
          <span>Continue</span>
          <ArrowIcon />
        </button>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function UploadZone({
  onUpload,
  isUploading,
}: {
  onUpload: (files: FileList | null) => void;
  isUploading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  return (
    <section className="px-6 py-5 border-b border-border/20">
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
        <input
          type="file"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) => onUpload(e.target.files)}
          className="hidden"
          accept=".csv,.txt,.tsv,.json"
        />

        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isDragOver
              ? "bg-primary/20"
              : "bg-secondary/15 group-hover:bg-primary/10"
          }`}
        >
          <UploadIcon
            className={`w-6 h-6 transition-colors ${
              isDragOver
                ? "text-primary"
                : "text-muted-foreground/40 group-hover:text-primary/70"
            }`}
          />
        </div>

        <div className="flex-1">
          <p className="font-mono text-sm font-medium text-foreground">
            {isUploading ? "Uploading..." : "Add dataset files"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/40 mt-0.5">
            Drag and drop or click to browse
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-muted-foreground/40 font-mono text-[10px] uppercase tracking-wider">
          <span>.csv</span>
          <span className="text-border/50">|</span>
          <span>.txt</span>
          <span className="text-border/50">|</span>
          <span>.tsv</span>
          <span className="text-border/50">|</span>
          <span>.json</span>
        </div>
      </label>
    </section>
  );
}

function FileRow({
  file,
  onAssignRole,
  onRemove,
}: {
  file: StoredFile;
  onAssignRole: (fileId: string, role: FileRole) => void;
  onRemove: (fileId: string) => void;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  return (
    <div className="group flex items-center gap-4 px-6 py-3.5 hover:bg-secondary/5 transition-colors">
      {/* File extension badge */}
      <div className="w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center shrink-0">
        <span className="font-mono text-[10px] text-muted-foreground/60 uppercase font-semibold">
          {extension}
        </span>
      </div>

      {/* File name + size */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm text-foreground truncate">{file.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-muted-foreground/40">
            {formatSize(file.size)}
          </span>
          <ValidationBadge status={file.validationStatus} />
        </div>
      </div>

      {/* Role selector */}
      <select
        value={file.role ?? ""}
        onChange={(e) => onAssignRole(file.id, e.target.value as FileRole)}
        className="bg-[#3a5a40] border border-border/20 rounded-lg px-3 py-2 font-mono text-[11px] text-[#dad7cd] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30 min-w-[130px]"
      >
        <option value="" disabled className="bg-[#3a5a40] text-[#dad7cd]">
          Assign role...
        </option>
        <option value="annotated" className="bg-[#3a5a40] text-[#dad7cd]">Annotated</option>
        <option value="unannotated" className="bg-[#3a5a40] text-[#dad7cd]">Unannotated</option>
        <option value="evaluation" className="bg-[#3a5a40] text-[#dad7cd]">Evaluation</option>
      </select>

      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        className="p-2 rounded-lg text-muted-foreground/30 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
        aria-label="Remove file"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ValidationBadge({ status }: { status: string }) {
  const styles = {
    pending: "text-muted-foreground/30",
    valid: "text-primary",
    invalid: "text-red-400",
  };

  return (
    <span className={`font-mono text-[9px] uppercase tracking-wider ${styles[status as keyof typeof styles] || styles.pending}`}>
      {status}
    </span>
  );
}

function RoleCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono text-xs font-semibold tabular-nums ${color}`}>
        {count}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground/50">
        {label}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary/10 border border-border/10 flex items-center justify-center mx-auto mb-4">
        <FileIcon className="w-7 h-7 text-muted-foreground/15" />
      </div>
      <p className="font-mono text-sm text-muted-foreground/30 font-medium">
        No files yet
      </p>
      <p className="font-mono text-[11px] text-muted-foreground/20 mt-1">
        Upload your dataset files to get started
      </p>
    </div>
  );
}

// --- Utility ---

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Icons ---

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
