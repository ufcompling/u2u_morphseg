/**
 * useProjectDB.ts
 * Location: src/hooks/useProjectDB.ts
 *
 * Purpose:
 *   IDBFS persistence layer for the TurtleShell project. Handles
 *   storage and retrieval of project metadata, uploaded files, cycle
 *   history, and per-word annotation state. All writes are async and
 *   fire-and-forget from the UI's perspective.
 *
 */

import { type fileData } from "../services/database/dataHelpers";
import { useState, useEffect, useCallback, useRef } from "react";
import { db, type CycleRow, type AnnotationRow } from "../lib/db";
import {
  type WorkflowStage,
  type ModelConfig,
  type CycleSnapshot,
  type AnnotationWord,
  type MorphemeBoundary,
  DEFAULT_MODEL_CONFIG,
} from "../lib/types";
import { log } from "../lib/logger";

const logger = log('project-db');

// ── Public types ─────────────────────────────────────────────────────────────

export interface ProjectState {
  currentStage: WorkflowStage;
  modelConfig: ModelConfig;
  currentIteration: number;
  cumulativeSelectSize: number;
}

export interface UseProjectDBReturn {
  /** True once the initial DB load is complete (success or failure). */
  dbReady: boolean;
  /** Non-null if the DB failed to open or the initial load threw. */
  dbError: string | null;

  // ── Loaded state ──
  /** Null on first-ever visit (no project row exists yet). */
  project: ProjectState | null;
  files: fileData[];
  cycleHistory: CycleSnapshot[];

  // ── Project metadata ──
  initProject: () => Promise<void>;
  saveProjectMeta: (partial: Partial<ProjectState>) => Promise<void>;

  // ── Files ──
  saveFile: (fileName: string, fileContent: string) => Promise<void>;
  importFiles: (files: FileList) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  clearFiles: (directory?: string) => Promise<void>;
  readFile: (filePath: string) => Promise<{fileContent: string; fileType: 'text' | 'pdf' | 'docx'}>;
  loadFiles: () => Promise<fileData[]>;

  // ── Cycles ──
  saveCycle: (cycle: Omit<CycleSnapshot, "iteration"> & {
    iteration: number;
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
  }) => Promise<void>;
  getCycleContent: (cycleNumber: number) => Promise<{
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
  } | null>;

  // ── Annotations ──
  saveAnnotationWords: (cycleNumber: number, words: AnnotationWord[]) => Promise<void>;
  confirmAnnotation: (
    cycleNumber: number,
    wordId: string,
    boundaries: MorphemeBoundary[]
  ) => Promise<void>;
  loadAnnotations: (cycleNumber: number) => Promise<AnnotationWord[]>;
  getConfirmedCount: (cycleNumber: number) => Promise<number>;

  // ── Cleanup ──
  clearAll: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useProjectDB(): UseProjectDBReturn {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [files, setFiles] = useState<fileData[]>([]);
  const [cycleHistory, setCycleHistory] = useState<CycleSnapshot[]>([]);

  // Guard against mutations before the DB is ready
  const ready = useRef(false);

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Project metadata
        const projectResult = await db.readFile("project.json");
        if (projectResult && projectResult.fileContent && !cancelled) {
          const meta = JSON.parse(projectResult.fileContent);
          setProject({
            currentStage: meta.currentStage as WorkflowStage,
            modelConfig: meta.modelConfig,
            currentIteration: meta.currentIteration,
            cumulativeSelectSize: meta.cumulativeSelectSize,
          });
        }

        // Files
        const loadedFiles = await db.loadFiles();
        if (!cancelled) setFiles(loadedFiles);
        // Cycles
        const cyclesResult = await db.readFile("cycles.json");
        if (cyclesResult && cyclesResult.fileContent && !cancelled) {
          const cyclesArr = JSON.parse(cyclesResult.fileContent);
          setCycleHistory(Array.isArray(cyclesArr) ? cyclesArr.map(cycleRowToSnapshot) : []);
        }
        ready.current = true;
        if (!cancelled) setDbReady(true);
      } catch (err) {
        logger.error("[useProjectDB] Failed to load from IDBFS:", err);
        if (!cancelled) {
          setDbError(err instanceof Error ? err.message : String(err));
          setDbReady(true); // still "ready" — the UI can render in degraded mode
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Project metadata ───────────────────────────────────────────────────────

  const initProject = useCallback(async () => {
    const now = Date.now();
    const meta = {
      currentStage: "ingestion" as WorkflowStage,
      modelConfig: DEFAULT_MODEL_CONFIG,
      currentIteration: 1,
      cumulativeSelectSize: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.saveFile("project.json", JSON.stringify(meta));
    setProject({
      currentStage: meta.currentStage,
      modelConfig: meta.modelConfig,
      currentIteration: meta.currentIteration,
      cumulativeSelectSize: meta.cumulativeSelectSize,
    });
  }, []);

  const saveProjectMeta = useCallback(async (partial: Partial<ProjectState>) => {
    if (!ready.current) return;
    // Read current project meta from file
    let existing: any = null;
    try {
      const projectResult = await db.readFile("project.json");
      if (projectResult && projectResult.fileContent) {
        existing = JSON.parse(projectResult.fileContent);
      }
    } catch {}
    if (!existing) {
      await initProject();
      return saveProjectMeta(partial);
    }
    const updated = {
      ...existing,
      ...partial,
      updatedAt: Date.now(),
    };
    await db.saveFile("project.json", JSON.stringify(updated));
    setProject((prev) => prev ? { ...prev, ...partial } : null);
  }, [initProject]);

  // ── Files (using new db class functions) ───────────────────────────────


  // Save a single file
  const saveFile = useCallback(async (fileName: string, fileContent: string): Promise<void> => {
    try {
      await db.saveFile(fileName, fileContent);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to save file:", err);
    }
  }, []);


  // Import multiple files
  const importFiles = useCallback(async (files: FileList): Promise<void> => {
    try {
      await db.importFiles(files);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to import files:", err);
    }
  }, []);


  // Delete a file
  const deleteFile = useCallback(async (filePath: string): Promise<void> => {
    try {
      await db.deleteFile(filePath);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to delete file:", err);
    }
  }, []);


  // Clear all files (optionally in a directory)
  const clearFiles = useCallback(async (directory?: string): Promise<void> => {
    try {
      await db.clearFiles(directory); // directory param not used in db API, but could be added
      setFiles([]);
    } catch (err) {
      logger.error("Failed to clear files:", err);
    }
  }, []);


  // Read a file's content
  const readFile = useCallback(async (filePath: string): Promise<{fileContent: string; fileType: 'text' | 'pdf' | 'docx'}> => {
    try {
      const result = await db.readFile(filePath);
      return result;
    } catch (err) {
      logger.error("Failed to read file:", err);
      return { fileContent: '', fileType: 'text' };
    }
  }, []);


  // Load all files
  const loadFiles = useCallback(async (): Promise<fileData[]> => {
    try {
      const loadedFiles = await db.loadFiles();
      setFiles(loadedFiles);
      return loadedFiles;
    } catch (err) {
      logger.error("Failed to load files:", err);
      return [];
    }
  }, []);

  // ── Cycles ─────────────────────────────────────────────────────────────────

  const saveCycle = useCallback(async (cycle: Omit<CycleSnapshot, "iteration"> & {
    iteration: number;
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
  }) => {
    // Load cycles array
    let cycles: CycleRow[] = [];
    try {
      const result = await db.readFile("cycles.json");
      if (result && result.fileContent) {
        cycles = JSON.parse(result.fileContent);
      }
    } catch {}
    // Upsert or add
    const idx = cycles.findIndex(c => c.cycleNumber === cycle.iteration);
    const row: CycleRow = {
      cycleNumber: cycle.iteration,
      precision: cycle.precision,
      recall: cycle.recall,
      f1: cycle.f1,
      annotatedCount: cycle.annotatedCount,
      incrementContent: cycle.incrementContent,
      residualContent: cycle.residualContent,
      evaluationContent: cycle.evaluationContent,
      completedAt: Date.now(),
    };
    if (idx >= 0) {
      cycles[idx] = row;
    } else {
      cycles.push(row);
    }
    await db.saveFile("cycles.json", JSON.stringify(cycles));
    setCycleHistory(cycles.map(cycleRowToSnapshot));
  }, []);

  const getCycleContent = useCallback(async (cycleNumber: number) => {
    let cycles: CycleRow[] = [];
    try {
      const result = await db.readFile("cycles.json");
      if (result && result.fileContent) {
        cycles = JSON.parse(result.fileContent);
      }
    } catch {}
    const row = cycles.find(c => c.cycleNumber === cycleNumber);
    if (!row) return null;
    return {
      incrementContent: row.incrementContent,
      residualContent: row.residualContent,
      evaluationContent: row.evaluationContent,
    };
  }, []);

  // ── Annotations ────────────────────────────────────────────────────────────

  const saveAnnotationWords = useCallback(async (
    cycleNumber: number,
    words: AnnotationWord[]
  ) => {
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile("annotations.json");
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    // Remove existing for this cycle
    annotations = annotations.filter(a => a.cycleNumber !== cycleNumber);
    // Add new
    const rows: AnnotationRow[] = words.map((w) => ({
      cycleNumber,
      wordId: w.id,
      word: w.word,
      confidence: w.confidence,
      boundaries: w.boundaries,
      confirmed: false,
    }));
    annotations.push(...rows);
    await db.saveFile("annotations.json", JSON.stringify(annotations));
  }, []);

  const confirmAnnotation = useCallback(async (
    cycleNumber: number,
    wordId: string,
    boundaries: MorphemeBoundary[]
  ) => {
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile("annotations.json");
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    const idx = annotations.findIndex(a => a.cycleNumber === cycleNumber && a.wordId === wordId);
    if (idx >= 0) {
      annotations[idx] = { ...annotations[idx], boundaries, confirmed: true };
      await db.saveFile("annotations.json", JSON.stringify(annotations));
    }
  }, []);

  const loadAnnotations = useCallback(async (cycleNumber: number): Promise<AnnotationWord[]> => {
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile("annotations.json");
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    return annotations.filter(a => a.cycleNumber === cycleNumber).map((r) => ({
      id: r.wordId,
      word: r.word,
      confidence: r.confidence,
      boundaries: r.boundaries,
    }));
  }, []);

  const getConfirmedCount = useCallback(async (cycleNumber: number): Promise<number> => {
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile("annotations.json");
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    return annotations.filter(a => a.cycleNumber === cycleNumber && a.confirmed).length;
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const clearAll = useCallback(async () => {
    // Remove all persistent files for project, cycles, annotations, and files
    try {
      await db.deleteFile("project.json");
    } catch {}
    try {
      await db.deleteFile("cycles.json");
    } catch {}
    try {
      await db.deleteFile("annotations.json");
    } catch {}
    try {
      await db.clearFiles();
    } catch {}
    setProject(null);
    setFiles([]);
    setCycleHistory([]);
  }, []);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    dbReady,
    dbError,
    project,
    files,
    cycleHistory,
    initProject,
    saveProjectMeta,
    saveFile,
    importFiles,
    deleteFile,
    clearFiles,
    loadFiles,
    readFile,
    saveCycle,
    getCycleContent,
    saveAnnotationWords,
    confirmAnnotation,
    loadAnnotations,
    getConfirmedCount,
    clearAll,
    
  };
}

// ── Row ↔ UI type mappers ────────────────────────────────────────────────────

function cycleRowToSnapshot(row: CycleRow): CycleSnapshot {
  return {
    iteration: row.cycleNumber,
    precision: row.precision,
    recall: row.recall,
    f1: row.f1,
    annotatedCount: row.annotatedCount,
  };
}