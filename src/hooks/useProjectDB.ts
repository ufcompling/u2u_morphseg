// Declare global language variable (set by UI, e.g. DatasetIngestion)
declare const language: string;
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

import { type fileData } from "../lib/types";
import { useState, useEffect, useCallback, useRef } from "react";
import { db, setLanguage, type CycleRow, type AnnotationRow } from "../lib/db";
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
  saveFile: (filePath: string, fileContent: string) => Promise<void>;
  importFile: (fileName: string, fileContent: string | Uint8Array) => Promise<void>;
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

  // Pyodide readiness from db API (worker)
  const [pyodideReady, setPyodideReady] = useState(db.pyodideReady);
  useEffect(() => {
    // Subscribe to db's readiness state
    const unsub = db.subPyodideReady(setPyodideReady);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pyodideReady) return;
    let cancelled = false;
    async function load() {
      try {
        // Ensure the worker knows the selected language before any FS ops
        try {
          if (language) setLanguage(language);
        } catch (err: any) {
          logger.warn('[useProjectDB] Failed to set worker language before initial load', err);
        }
        // Ensure FS is populated and synced by loading files first
        let loadedFiles: fileData[] = [];
        try {
          logger.info(language);
          loadedFiles = await db.loadFiles();
        } catch (err: any) {
          logger.warn("[useProjectDB] Failed to load files (initial):", err);
        }
        if (!cancelled) setFiles(loadedFiles);

        // Project metadata
        // Always create project.json if missing before reading
        let projectResult = null;
        let projectFileExists = true;
        try {
          await db.readFile(`/data/${language}/project.json`);
        } catch (err: any) {
          projectFileExists = false;
        }
        if (!projectFileExists) {
          const now = Date.now();
          const meta = {
            currentStage: "ingestion" as WorkflowStage,
            modelConfig: DEFAULT_MODEL_CONFIG,
            currentIteration: 1,
            cumulativeSelectSize: 0,
            createdAt: now,
            updatedAt: now,
          };
          logger.info(JSON.stringify(meta), typeof JSON.stringify(meta));
          await db.saveFile(`/data/${language}/project.json`, JSON.stringify(meta));
          // Ensure cycles and annotations files exist for a fresh project
          try {
            await db.saveFile(`/data/${language}/cycles.json`, JSON.stringify([]));
          } catch (err) {
            logger.warn('[useProjectDB] Failed to create cycles.json during initProject', err);
          }
          try {
            await db.saveFile(`/data/${language}/annotations.json`, JSON.stringify([]));
          } catch (err) {
            logger.warn('[useProjectDB] Failed to create annotations.json during initProject', err);
          }
        }
        logger.info("[useProjectDB] Calling db.readFile for project.json...", { ts: Date.now() });
        try {
          projectResult = await db.readFile(`/data/${language}/project.json`);
          logger.info("[useProjectDB] db.readFile result for project.json:", {
            ts: Date.now(),
            typeofResult: typeof projectResult,
            hasContent: !!projectResult?.fileContent,
            contentLength: projectResult?.fileContent?.length,
          });
        } catch (err: any) {
          console.error("[useProjectDB] db.readFile threw for project.json:", { err: err?.message || err, stack: err?.stack });
          throw err;
        }
        if (projectResult && projectResult.fileContent && !cancelled) {
          const meta = JSON.parse(projectResult.fileContent);
          setProject({
            currentStage: meta.currentStage as WorkflowStage,
            modelConfig: meta.modelConfig,
            currentIteration: meta.currentIteration,
            cumulativeSelectSize: meta.cumulativeSelectSize,
          });
        }

        // Cycles
        // Always create cycles.json if missing before reading
        let cyclesFileExists = true;
        try {
          await db.readFile(`/data/${language}/cycles.json`);
        } catch (err: any) {
          if (err && err.message && err.message.startsWith('File not found:')) {
            cyclesFileExists = false;
          } else {
            throw err;
          }
        }
        if (!cyclesFileExists) {
          await db.saveFile(`/data/${language}/cycles.json`, JSON.stringify([]));
        }
        let cyclesResult = await db.readFile(`/data/${language}/cycles.json`);
        if (cyclesResult && cyclesResult.fileContent && !cancelled) {
          const cyclesArr = JSON.parse(cyclesResult.fileContent);
          setCycleHistory(Array.isArray(cyclesArr) ? cyclesArr.map(cycleRowToSnapshot) : []);
        }
        // Annotations: ensure annotations.json exists before any annotation ops
        let annotationsFileExists = true;
        try {
          await db.readFile(`/data/${language}/annotations.json`);
        } catch (err: any) {
          if (err && err.message && err.message.startsWith('File not found:')) {
            annotationsFileExists = false;
          } else {
            throw err;
          }
        }
        if (!annotationsFileExists) {
          await db.saveFile(`/data/${language}/annotations.json`, JSON.stringify([]));
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
  }, [pyodideReady]);

  // ── Project metadata ───────────────────────────────────────────────────────

  const initProject = useCallback(async () => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking initProject");
      return;
    }
    if (!language) {
      throw new Error("[useProjectDB] Language is not set. Please select a language before initializing the project.");
    }
    const now = Date.now();
    const meta = {
      currentStage: "ingestion" as WorkflowStage,
      modelConfig: DEFAULT_MODEL_CONFIG,
      currentIteration: 1,
      cumulativeSelectSize: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.saveFile(`/data/${language}/project.json`, JSON.stringify(meta));
    setProject({
      currentStage: meta.currentStage,
      modelConfig: meta.modelConfig,
      currentIteration: meta.currentIteration,
      cumulativeSelectSize: meta.cumulativeSelectSize,
    });
  }, [pyodideReady]);

  const saveProjectMeta = useCallback(async (partial: Partial<ProjectState>) => {
    if (!ready.current || !pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking saveProjectMeta");
      return;
    }
    // Read current project meta from file
    let existing: any = null;
    try {
      const projectResult = await db.readFile(`/data/${language}/project.json`);
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
    await db.saveFile(`/data/${language}/project.json`, JSON.stringify(updated));
    setProject((prev) => prev ? { ...prev, ...partial } : null);
  }, [initProject, pyodideReady]);

  // ── Files (using new db class functions) ───────────────────────────────


  // Save a single file
  const saveFile = useCallback(async (filePath: string, fileContent: string): Promise<void> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking saveFile");
      return;
    }
    try {
      await db.saveFile(`${filePath}`, fileContent);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to save file:", err);
    }
  }, [pyodideReady]);


  // Import a single file (new API)
  const importFile = useCallback(async (fileName: string, fileContent: string | Uint8Array): Promise<void> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking importFile");
      return;
    }
    try {
      await db.importFile(fileName, fileContent);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to import file:", err);
    }
  }, [pyodideReady]);


  // Delete a file
  const deleteFile = useCallback(async (filePath: string): Promise<void> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking deleteFile");
      return;
    }
    try {
      await db.deleteFile(filePath);
      const updatedFiles = await db.loadFiles();
      setFiles(updatedFiles);
    } catch (err) {
      logger.error("Failed to delete file:", err);
    }
  }, [pyodideReady]);


  // Clear all files (optionally in a directory)
  const clearFiles = useCallback(async (directory?: string): Promise<void> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking clearFiles");
      return;
    }
    try {
      await db.clearFiles(directory); // directory param not used in db API, but could be added
      setFiles([]);
    } catch (err) {
      logger.error("Failed to clear files:", err);
    }
  }, [pyodideReady]);


  // Read a file's content
  const readFile = useCallback(async (filePath: string): Promise<{fileContent: string; fileType: 'text' | 'pdf' | 'docx'}> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking readFile");
      return { fileContent: '', fileType: 'text' };
    }
    try {
      const result = await db.readFile(filePath);
      return result;
    } catch (err) {
      logger.error("Failed to read file:", err);
      return { fileContent: '', fileType: 'text' };
    }
  }, [pyodideReady]);


  // Load all files
  const loadFiles = useCallback(async (): Promise<fileData[]> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking loadFiles");
      return [];
    }
    try {
      const loadedFiles = await db.loadFiles();
      setFiles(loadedFiles);
      return loadedFiles;
    } catch (err) {
      logger.error("Failed to load files:", err);
      return [];
    }
  }, [pyodideReady]);

  // ── Cycles ─────────────────────────────────────────────────────────────────

  const saveCycle = useCallback(async (cycle: Omit<CycleSnapshot, "iteration"> & {
    iteration: number;
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
  }) => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking saveCycle");
      return;
    }
    // Load cycles array
    let cycles: CycleRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/cycles.json`);
      if (result && result.fileContent) {
        cycles = JSON.parse(result.fileContent);
      }
    } catch (err: any) {
      if (err && err.message && err.message.startsWith('File not found:')) {
        cycles = [];
      } else {
        throw err;
      }
    }
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
    await db.saveFile(`/data/${language}/cycles.json`, JSON.stringify(cycles));
    setCycleHistory(cycles.map(cycleRowToSnapshot));
  }, [pyodideReady]);

  const getCycleContent = useCallback(async (cycleNumber: number) => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking getCycleContent");
      return null;
    }
    let cycles: CycleRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/cycles.json`);
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
  }, [pyodideReady]);

  // ── Annotations ────────────────────────────────────────────────────────────

  const saveAnnotationWords = useCallback(async (
    cycleNumber: number,
    words: AnnotationWord[]
  ) => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking saveAnnotationWords");
      return;
    }
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/annotations.json`);
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
    await db.saveFile(`/data/${language}/annotations.json`, JSON.stringify(annotations));
  }, [pyodideReady]);

  const confirmAnnotation = useCallback(async (
    cycleNumber: number,
    wordId: string,
    boundaries: MorphemeBoundary[]
  ) => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking confirmAnnotation");
      return;
    }
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/annotations.json`);
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    const idx = annotations.findIndex(a => a.cycleNumber === cycleNumber && a.wordId === wordId);
    if (idx >= 0) {
      annotations[idx] = { ...annotations[idx], boundaries, confirmed: true };
      await db.saveFile(`/data/${language}/annotations.json`, JSON.stringify(annotations));
    }
  }, [pyodideReady]);

  const loadAnnotations = useCallback(async (cycleNumber: number): Promise<AnnotationWord[]> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking loadAnnotations");
      return [];
    }
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/annotations.json`);
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
  }, [pyodideReady]);

  const getConfirmedCount = useCallback(async (cycleNumber: number): Promise<number> => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking getConfirmedCount");
      return 0;
    }
    let annotations: AnnotationRow[] = [];
    try {
      const result = await db.readFile(`/data/${language}/annotations.json`);
      if (result && result.fileContent) {
        annotations = JSON.parse(result.fileContent);
      }
    } catch {}
    return annotations.filter(a => a.cycleNumber === cycleNumber && a.confirmed).length;
  }, [pyodideReady]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const clearAll = useCallback(async () => {
    if (!pyodideReady) {
      logger.warn("[useProjectDB] Pyodide not ready, blocking clearAll");
      return;
    }
    // Remove all persistent files for project, cycles, annotations, and files
    logger.info('[useProjectDB] clearAll() invoked — deleting project/cycles/annotations and clearing files for language:', language);
    try {
      await db.deleteFile(`/data/${language}/project.json`);
    } catch {}
    try {
      await db.deleteFile(`/data/${language}/cycles.json`);
    } catch {}
    try {
      await db.deleteFile(`/data/${language}/annotations.json`);
    } catch {}
    try {
      logger.info('[useProjectDB] calling db.clearFiles()');
      await db.clearFiles();
    } catch {}
    setProject(null);
    setFiles([]);
    setCycleHistory([]);
  }, [pyodideReady]);

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
    importFile,
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