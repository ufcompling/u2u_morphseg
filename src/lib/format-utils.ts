/**
 * format-utils.ts
 * Location: src/lib/format-utils.ts
 *
 * Purpose:
 *   Pure utility functions for data format conversion, file operations,
 *   and workflow state derivation. Stateless and independently testable.
 *
 * Key functions:
 *   tgtToSrc          - Strip boundary markers from .tgt to produce .src format
 *   annotationToTgtLine - Convert annotated word back to .tgt format
 *   triggerDownload    - Initiate a browser file download from a string
 *   getFileContent     - Look up a file's content by its role
 *   getFileByRole      - Look up a full StoredFile by its role
 *   deriveCompletedStages - Compute which workflow stages are complete
 *   validateTgtFormat  - Check whether a string is valid .tgt content
 *
 * Dependencies: types.ts
 */

import type { StoredFile, FileRole, WorkflowStage, AnnotationWord } from "./types";

/**
 * Derive .src from .tgt — strips boundary markers so each line is just
 * space-separated characters. Python's CRF pipeline needs both formats.
 */
export function tgtToSrc(tgt: string): string {
  return tgt
    .split("\n")
    .map((line) => line.replace(/!/g, "").replace(/\s+/g, " ").trim())
    .join("\n");
}

/**
 * Convert an annotated word (with boundary indices) back to .tgt format.
 * e.g. word="running", boundaries=[{index:2}] → "r u n ! n i n g"
 *
 * MorphemeBoundary.index = the character index AFTER which a boundary exists.
 * Characters are space-separated; morpheme boundaries are marked with "!".
 */
export function annotationToTgtLine(word: AnnotationWord): string {
  const chars = word.word.split("");
  const boundarySet = new Set(word.boundaries.map((b) => b.index));
  let result = "";
  for (let i = 0; i < chars.length; i++) {
    result += chars[i];
    if (boundarySet.has(i) && i < chars.length - 1) {
      result += "!";
    }
  }
  return result;
}

/** Trigger a browser file download from an in-memory string. */
export function triggerDownload(content: string, filename: string): void {
  if (!content) return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Look up a file's raw content by its assigned role. Returns "" if not found. */
export function getFileContent(files: StoredFile[], role: FileRole): string {
  return files.find((f) => f.role === role)?.content ?? "";
}

/** Look up the full StoredFile object by its assigned role. */
export function getFileByRole(files: StoredFile[], role: FileRole): StoredFile | undefined {
  return files.find((f) => f.role === role);
}

/** Derive which stages the user has completed based on the current stage position. */
export function deriveCompletedStages(current: WorkflowStage): WorkflowStage[] {
  const order: WorkflowStage[] = ["ingestion", "config", "training", "annotation", "results"];
  const idx = order.indexOf(current);
  return idx > 0 ? order.slice(0, idx) : [];
}

/**
 * Validate that a string conforms to the .tgt file format.
 *
 * Valid .tgt format:
 *   - Non-empty content
 *   - Each non-blank line contains space-separated characters with optional "!" boundary markers
 *   - e.g. "r u n ! n i n g" or "c a t"
 *
 * Returns { valid: boolean; error?: string }
 */
export function validateTgtFormat(content: string): { valid: boolean; error?: string } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: false, error: "File is empty" };
  }

  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { valid: false, error: "File contains no non-empty lines" };
  }

  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i].trim().split(/\s+/);
    const hasContent = tokens.some((t) => t !== "!");
    if (!hasContent) {
      return { valid: false, error: `Line ${i + 1}: no character content found (only boundary markers)` };
    }
    // Each token should be a single character or the boundary marker "!"
    const badToken = tokens.find((t) => t !== "!" && t.length !== 1);
    if (badToken) {
      return { valid: false, error: `Line ${i + 1}: expected single characters separated by spaces, found "${badToken}"` };
    }
  }

  return { valid: true };
}