import { useState, type DragEvent, type ChangeEvent } from "react";
import type { StoredFile, FileRole } from "../../lib/types";
import { formatSize } from "../../lib/format-utils";
import { UploadIcon, FileIcon, TrashIcon, ArrowIcon } from "../ui/icons";

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
          accept=".tgt,.csv,.txt,.tsv,.json"
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
          <span>.tgt</span>
          <span className="text-border/50">|</span>
          <span>.txt</span>
          <span className="text-border/50">|</span>
          <span>.csv</span>
          <span className="text-border/50">|</span>
          <span>.tsv</span>
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
        className="bg-card border border-border/20 rounded-lg px-3 py-2 font-mono text-[11px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30 min-w-[130px]"
      >
        <option value="" disabled className="bg-card text-foreground">
          Assign role...
        </option>
        <option value="annotated" className="bg-card text-foreground">Annotated</option>
        <option value="unannotated" className="bg-card text-foreground">Unannotated</option>
        <option value="evaluation" className="bg-card text-foreground">Evaluation</option>
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