import { useState, useEffect, type DragEvent, type ChangeEvent } from "react";
import type { fileData, FileRole } from "../../../lib/types";
import { formatSize } from "../../../lib/format-utils";
import {
  UploadIcon, FileIcon, TrashIcon, ArrowIcon,
} from "../../../components/ui/icons";
import {
  validateAnnotatedFile,
  validateUnannotatedFile,
  type ValidationResult,
  MIN_ANNOTATED_LINES,
} from "../../../lib/validation";

// ============================================================
// Dataset Ingestion Stage
// Upload files, assign roles, view validation status
// ============================================================

interface DatasetIngestionProps {
  files: fileData[];
  onUpload: (fileList: FileList | null) => void;
  onAssignRole: (filePath: string, role: FileRole) => void;
  onRemoveFile: (filePath: string) => void;
  onStartTraining: () => void;
  onBack: () => void;
  isUploading: boolean;
  pyodideReady: boolean;
  /** Delimiter from ModelConfig — used to validate annotated files */
  delimiter: string;
}

export function DatasetIngestion({
  files,
  onUpload,
  onAssignRole,
  onRemoveFile,
  onStartTraining,
  onBack,
  isUploading,
  pyodideReady,
  delimiter,
}: DatasetIngestionProps) {
  const hiddenNames = new Set(["project.json", "cycles.json", "annotations.json"]);
  const visibleFiles = files.filter((f) => !hiddenNames.has(f.fileName));

  // Validation results keyed by filePath — runs whenever files, roles, or delimiter change
  const [validationMap, setValidationMap] = useState<Map<string, ValidationResult>>(new Map());

  useEffect(() => {
    const next = new Map<string, ValidationResult>();

    for (const file of visibleFiles) {
      if (!file.fileRole || !file.fileContent) {
        // No role assigned yet or content not loaded — skip
        continue;
      }

      const result =
        file.fileRole === "annotated"
          ? validateAnnotatedFile(file.fileContent, delimiter)
          : validateUnannotatedFile(file.fileContent, delimiter);

      next.set(file.filePath, result);
    }

    setValidationMap(next);
  }, [files, delimiter]); // eslint-disable-line react-hooks/exhaustive-deps

  const annotatedFiles   = visibleFiles.filter((f) => f.fileRole === "annotated");
  const unannotatedFiles = visibleFiles.filter((f) => f.fileRole === "unannotated");
  const annotatedCount   = annotatedFiles.length;
  const unannotatedCount = unannotatedFiles.length;

  // A file blocks training if its validation result is "invalid"
  const hasBlockingError = (fileList: fileData[]) =>
    fileList.some((f) => validationMap.get(f.filePath)?.level === "invalid");

  const filesAssigned     = annotatedCount > 0 && unannotatedCount > 0;
  const annotatedBlocked  = hasBlockingError(annotatedFiles);
  const unannotatedBlocked = hasBlockingError(unannotatedFiles);
  const canStartTraining  = filesAssigned && !annotatedBlocked && !unannotatedBlocked;

  // Compose a status message for the footer
  let statusMessage: { text: string; isError: boolean };
  if (!filesAssigned) {
    statusMessage = {
      text: "Assign at least one annotated and one unannotated file to continue",
      isError: false,
    };
  } else if (annotatedBlocked) {
    const result = validationMap.get(annotatedFiles[0]?.filePath ?? "");
    statusMessage = { text: result?.summary ?? "Annotated file has errors", isError: true };
  } else if (unannotatedBlocked) {
    const result = validationMap.get(unannotatedFiles[0]?.filePath ?? "");
    statusMessage = { text: result?.summary ?? "Unannotated file has errors", isError: true };
  } else {
    statusMessage = { text: "Ready to proceed", isError: false };
  }

  return (
    <div className="flex flex-col gap-0">
      <UploadZone onUpload={onUpload} isUploading={isUploading} pyodideReady={pyodideReady} />

      {/* Delimiter indicator — visible once files are assigned */}
      {filesAssigned && (
        <div className="px-6 py-2 border-b border-border/10 bg-secondary/5 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">
            Delimiter
          </span>
          <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/15 font-mono text-[11px] text-primary/80 font-semibold">
            {delimiter}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/30">
            — change in Model Config if wrong
          </span>
        </div>
      )}

      {/* Role summary bar */}
      {visibleFiles.length > 0 && (
        <div className="px-6 py-3 border-b border-border/20 bg-secondary/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <RoleCount label="Annotated" count={annotatedCount} color="text-primary" />
            <RoleCount label="Unannotated" count={unannotatedCount} color="text-foreground" />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {visibleFiles.length} total
          </span>
        </div>
      )}

      {/* File list */}
      <div className="max-h-[360px] overflow-y-auto">
        {visibleFiles.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border/10">
            {visibleFiles.map((file) => (
              <FileRow
                key={file.filePath}
                file={file}
                validationResult={validationMap.get(file.filePath) ?? null}
                onAssignRole={onAssignRole}
                onRemove={onRemoveFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Validation detail panel — shows when there are issues */}
      {filesAssigned && (annotatedBlocked || unannotatedBlocked) && (
        <ValidationPanel
          annotatedFiles={annotatedFiles}
          unannotatedFiles={unannotatedFiles}
          validationMap={validationMap}
          delimiter={delimiter}
        />
      )}

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-border/20 flex items-center justify-between">
        <p
          className={`font-mono text-[10px] max-w-sm leading-relaxed ${
            statusMessage.isError
              ? "text-red-400/70"
              : canStartTraining
                ? "text-primary/70"
                : "text-muted-foreground/70"
          }`}
        >
          {statusMessage.text}
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-all"
          >
            Back
          </button>
          <button
            onClick={onStartTraining}
            disabled={!canStartTraining}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-mono text-xs font-semibold tracking-wide transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
          >
            <span>Start Training</span>
            <ArrowIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Validation detail panel ──────────────────────────────────────────────────

function ValidationPanel({
  annotatedFiles,
  unannotatedFiles,
  validationMap,
  // delimiter, TOOD: use delimiter in the future.
}: {
  annotatedFiles: fileData[];
  unannotatedFiles: fileData[];
  validationMap: Map<string, ValidationResult>;
  delimiter: string;
}) {
  const allIssues: string[] = [];

  for (const f of [...annotatedFiles, ...unannotatedFiles]) {
    const r = validationMap.get(f.filePath);
    if (r && r.issues.length > 0) {
      for (const issue of r.issues.slice(0, 3)) {
        allIssues.push(issue);
      }
    }
  }

  if (allIssues.length === 0) return null;

  return (
    <div className="mx-6 mb-3 px-4 py-3 rounded-xl bg-red-400/5 border border-red-400/15">
      <p className="font-mono text-[10px] text-red-400/70 font-semibold uppercase tracking-wider mb-2">
        Validation issues
      </p>
      <ul className="flex flex-col gap-1">
        {allIssues.map((issue, i) => (
          <li key={i} className="font-mono text-[11px] text-red-400/60 leading-relaxed">
            · {issue}
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10px] text-muted-foreground/30 mt-2">
        Min annotated examples: {MIN_ANNOTATED_LINES}
      </p>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function UploadZone({
  onUpload,
  isUploading,
  pyodideReady,
}: {
  onUpload: (files: FileList | null) => void;
  isUploading: boolean;
  pyodideReady: boolean;
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

  return (
    <section className="px-6 py-5 border-b border-border/20">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
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
          disabled={!pyodideReady}
        />
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isDragOver ? "bg-primary/20" : "bg-secondary/15 group-hover:bg-primary/10"
          }`}
        >
          <UploadIcon
            className={`w-6 h-6 transition-colors ${
              isDragOver ? "text-primary" : "text-muted-foreground/40 group-hover:text-primary/70"
            }`}
          />
        </div>
        <div className="flex-1">
          <p className="font-mono text-sm font-medium text-foreground">
            {isUploading ? "Uploading..." : "Add dataset files"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/70 mt-0.5">
            Drag and drop or click to browse
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-muted-foreground/70 font-mono text-[10px] uppercase tracking-wider">
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
  validationResult,
  onAssignRole,
  onRemove,
}: {
  file: fileData;
  validationResult: ValidationResult | null;
  onAssignRole: (filePath: string, role: FileRole) => void;
  onRemove: (filePath: string) => void;
}) {
  const extension = (file.fileName ?? "").split(".").pop()?.toLowerCase() || "";

  return (
    <div className="group flex items-center gap-4 px-6 py-3.5 hover:bg-secondary/5 transition-colors">
      {/* File extension badge */}
      <div className="w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center shrink-0">
        <span className="font-mono text-[10px] text-muted-foreground/70 uppercase font-semibold">
          {extension}
        </span>
      </div>

      {/* File name + size + validation */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm text-foreground truncate">{file.fileName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-muted-foreground/40">
            {formatSize(file.fileSize)}
          </span>
          {validationResult ? (
            <ValidationBadge result={validationResult} />
          ) : (
            <span className="font-mono text-[9px] text-muted-foreground/25 uppercase tracking-wider">
              {file.fileRole ? "validating..." : "assign role to validate"}
            </span>
          )}
        </div>
      </div>

      {/* Role selector */}
      <select
        value={file.fileRole ?? ""}
        onChange={(e) => onAssignRole(file.filePath, e.target.value as FileRole)}
        className="bg-card border border-border/20 rounded-lg px-3 py-2 font-mono text-[11px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30 min-w-[130px]"
      >
        <option value="" disabled className="bg-card text-foreground">
          Assign role...
        </option>
        <option value="annotated" className="bg-card text-foreground">Annotated</option>
        <option value="unannotated" className="bg-card text-foreground">Unannotated</option>
      </select>

      {/* Remove button */}
      <button
        onClick={() => onRemove(file.filePath)}
        className="p-2 rounded-lg text-muted-foreground/30 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
        aria-label="Remove file"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ValidationBadge({ result }: { result: ValidationResult }) {
  const styles: Record<string, string> = {
    valid:   "text-primary/70",
    warning: "text-amber-400/70",
    invalid: "text-red-400/70",
    pending: "text-muted-foreground/30",
  };

  const icons: Record<string, string> = {
    valid:   "✓",
    warning: "⚠",
    invalid: "✕",
    pending: "·",
  };

  return (
    <span className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${styles[result.level]}`}>
      <span>{icons[result.level]}</span>
      <span>{result.summary}</span>
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
      <span className="font-mono text-[10px] text-muted-foreground/70">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary/10 border border-border/10 flex items-center justify-center mx-auto mb-4">
        <FileIcon className="w-7 h-7 text-muted-foreground/15" />
      </div>
      <p className="font-mono text-sm text-muted-foreground/70 font-medium">No files yet</p>
      <p className="font-mono text-[11px] text-muted-foreground/70 mt-1">
        Upload your dataset files to get started
      </p>
    </div>
  );
}