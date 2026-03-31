// ── Types ────────────────────────────────────────────────────────────────────

export type ValidationLevel = "pending" | "valid" | "warning" | "invalid";

export interface ValidationResult {
  level: ValidationLevel;
  /** Short summary shown in the file row: "423 words" or "Too few examples" */
  summary: string;
  /** Specific problems found — shown as a list under the summary */
  issues: string[];
  lineCount: number;
  /** Only set for annotated files — delimiter detected from content */
  detectedDelimiter?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum number of annotated lines required to start training.
 * TODO: confirm exact threshold with Dr. Liu before finalizing.
 */
export const MIN_ANNOTATED_LINES = 10;

/** Delimiters considered when auto-detecting annotated files. */
const DELIMITER_CANDIDATES = ["!", "|", "+", "-", "_"];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize a raw file string into trimmed, non-empty lines.
 * Handles both \n and \r\n (Windows) line endings.
 */
function parseLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Collapse space-separated characters into a compact word.
 * "p r e a c h e d" → "preached"
 * "preached"         → "preached"  (no-op for compact format)
 */
function collapse(line: string): string {
  return line.replace(/\s+/g, "");
}

/**
 * Detect the most likely delimiter used in a set of lines by counting
 * occurrences across the first 30 lines.
 * Returns null if no candidate appears in at least 10% of lines.
 */
function detectDelimiter(lines: string[]): string | null {
  const sample = lines.slice(0, 30);
  const counts: Record<string, number> = {};
  for (const c of DELIMITER_CANDIDATES) counts[c] = 0;

  for (const line of sample) {
    const word = collapse(line);
    for (const c of DELIMITER_CANDIDATES) {
      if (word.includes(c)) counts[c]++;
    }
  }

  const best = DELIMITER_CANDIDATES.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  const rate = counts[best] / sample.length;
  return rate >= 0.1 ? best : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate an unannotated dataset file.
 *
 * Rules:
 *  - Must be non-empty
 *  - Each line must produce a non-empty word after collapsing spaces
 *  - Lines should not contain the configured delimiter (wrong file warning)
 *
 * @param content   Raw file text
 * @param delimiter The annotated-file delimiter from config (used to detect swapped files)
 */
export function validateUnannotatedFile(
  content: string,
  delimiter: string
): ValidationResult {
  if (!content || content.trim().length === 0) {
    return { level: "invalid", summary: "File is empty", issues: [], lineCount: 0 };
  }

  const lines = parseLines(content);

  if (lines.length === 0) {
    return { level: "invalid", summary: "File is empty", issues: [], lineCount: 0 };
  }

  const issues: string[] = [];
  let delimiterHits = 0;

  for (let i = 0; i < lines.length; i++) {
    const word = collapse(lines[i]);

    if (word.length === 0) {
      // Already filtered by parseLines, defensive guard
      issues.push(`Line ${i + 1}: empty after collapsing spaces`);
      continue;
    }

    if (word.includes(delimiter)) {
      delimiterHits++;
    }
  }

  // If a meaningful portion of lines contain the delimiter, this looks like
  // an annotated file uploaded in the wrong role slot.
  const delimiterRate = delimiterHits / lines.length;
  if (delimiterRate >= 0.3) {
    issues.push(
      `${delimiterHits} of ${lines.length} lines contain "${delimiter}" — this looks like an annotated file. Check the role assignment.`
    );
    return {
      level: "invalid",
      summary: "Looks like an annotated file",
      issues,
      lineCount: lines.length,
    };
  }

  if (delimiterHits > 0) {
    issues.push(
      `${delimiterHits} line${delimiterHits > 1 ? "s" : ""} contain "${delimiter}" — double-check this isn't an annotated file`
    );
  }

  return {
    level: issues.length > 0 ? "warning" : "valid",
    summary: `${lines.length} word${lines.length !== 1 ? "s" : ""}`,
    issues,
    lineCount: lines.length,
  };
}

/**
 * Validate an annotated dataset file.
 *
 * Rules:
 *  - Must be non-empty
 *  - Must have at least MIN_ANNOTATED_LINES lines
 *  - Lines with the delimiter must have no empty morpheme segments
 *    (e.g. "walk!!ed" or "!happy" are invalid)
 *  - At least one line should contain the delimiter; if none do, warn
 *    that the delimiter setting may be wrong
 *  - Auto-detects actual delimiter and warns if it differs from configured
 *
 * @param content   Raw file text
 * @param delimiter The delimiter character configured by the user
 */
export function validateAnnotatedFile(
  content: string,
  delimiter: string
): ValidationResult {
  if (!content || content.trim().length === 0) {
    return { level: "invalid", summary: "File is empty", issues: [], lineCount: 0 };
  }

  const lines = parseLines(content);

  if (lines.length === 0) {
    return { level: "invalid", summary: "File is empty", issues: [], lineCount: 0 };
  }

  // Minimum dataset size check
  if (lines.length < MIN_ANNOTATED_LINES) {
    return {
      level: "invalid",
      summary: `Too few examples — need at least ${MIN_ANNOTATED_LINES}`,
      issues: [
        `Found ${lines.length} line${lines.length !== 1 ? "s" : ""}, minimum is ${MIN_ANNOTATED_LINES}.`,
        "Add more annotated words before training.",
      ],
      lineCount: lines.length,
    };
  }

  const issues: string[] = [];
  let annotatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const word = collapse(lines[i]);

    if (!word.includes(delimiter)) {
      // Monomorphemic word — valid, no delimiter expected
      continue;
    }

    annotatedCount++;

    // Split by delimiter and check for empty segments
    const morphemes = word.split(delimiter);
    const emptySegments = morphemes.filter((m) => m.length === 0);
    if (emptySegments.length > 0) {
      issues.push(
        `Line ${i + 1}: empty morpheme segment in "${word}" — check for doubled or leading/trailing "${delimiter}"`
      );
    }
  }

  // Detect actual delimiter from content
  const detected = detectDelimiter(lines);
  const delimiterRate = annotatedCount / lines.length;

  // If zero lines have the configured delimiter but the file is non-trivial,
  // the delimiter setting is probably wrong.
  if (annotatedCount === 0 && lines.length > 5) {
    const hint = detected
      ? `Auto-detected "${detected}" as the likely delimiter — update the delimiter setting in Model Config.`
      : `No lines contain "${delimiter}". If all words are monomorphemic this is fine, otherwise check the delimiter setting.`;

    issues.push(hint);

    return {
      level: "warning",
      summary: `${lines.length} words — delimiter "${delimiter}" not found`,
      issues,
      lineCount: lines.length,
      detectedDelimiter: detected ?? undefined,
    };
  }

  // Warn if the detected delimiter differs from the configured one
  if (detected && detected !== delimiter && delimiterRate < 0.05) {
    issues.push(
      `Lines mostly use "${detected}" but delimiter is set to "${delimiter}" — results may be incorrect.`
    );
  }

  const level = issues.some((iss) => iss.includes("empty morpheme")) ? "invalid"
    : issues.length > 0 ? "warning"
    : "valid";

  return {
    level,
    summary:
      annotatedCount > 0
        ? `${lines.length} words, ${annotatedCount} segmented`
        : `${lines.length} words (all monomorphemic)`,
    issues,
    lineCount: lines.length,
    detectedDelimiter: detected ?? undefined,
  };
}