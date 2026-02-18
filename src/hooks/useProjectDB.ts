import { useState, useEffect, useCallback, useRef } from "react";
import { db, type ProjectRow, type FileRow, type CycleRow, type AnnotationRow } from "../lib/db";
import {
  type WorkflowStage,
  type ModelConfig,
  type FileRole,
  type StoredFile,
  type CycleSnapshot,
  type AnnotationWord,
  type MorphemeBoundary,
  DEFAULT_MODEL_CONFIG,
} from "../lib/types";

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
  files: StoredFile[];
  cycleHistory: CycleSnapshot[];

  // ── Project metadata ──
  initProject: () => Promise<void>;
  saveProjectMeta: (partial: Partial<ProjectState>) => Promise<void>;

  // ── Files ──
  saveFile: (file: Omit<StoredFile, "id">) => Promise<StoredFile>;
  saveFiles: (files: Omit<StoredFile, "id">[]) => Promise<StoredFile[]>;
  updateFileRole: (fileId: string, role: FileRole) => Promise<void>;
  updateFileContent: (fileId: string, content: string) => Promise<void>;
  updateFileValidation: (fileId: string, status: "valid" | "invalid" | "pending") => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;

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

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID = 1;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectDB(): UseProjectDBReturn {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [cycleHistory, setCycleHistory] = useState<CycleSnapshot[]>([]);

  // Guard against mutations before the DB is ready
  const ready = useRef(false);

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Project singleton
        const row = await db.project.get(PROJECT_ID);
        if (row && !cancelled) {
          setProject({
            currentStage: row.currentStage,
            modelConfig: row.modelConfig,
            currentIteration: row.currentIteration,
            cumulativeSelectSize: row.cumulativeSelectSize,
          });
        }

        // Files — map from DB rows to the StoredFile shape the UI expects
        const fileRows = await db.files.toArray();
        if (!cancelled) {
          setFiles(fileRows.map(fileRowToStoredFile));
        }

        // Cycle history — ordered by cycleNumber for the timeline
        const cycleRows = await db.cycles.orderBy("cycleNumber").toArray();
        if (!cancelled) {
          setCycleHistory(cycleRows.map(cycleRowToSnapshot));
        }

        ready.current = true;
        if (!cancelled) setDbReady(true);
      } catch (err) {
        console.error("[useProjectDB] Failed to load from IndexedDB:", err);
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
    const row: ProjectRow = {
      id: PROJECT_ID,
      currentStage: "ingestion",
      modelConfig: DEFAULT_MODEL_CONFIG,
      currentIteration: 1,
      cumulativeSelectSize: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.project.put(row);
    setProject({
      currentStage: row.currentStage,
      modelConfig: row.modelConfig,
      currentIteration: row.currentIteration,
      cumulativeSelectSize: row.cumulativeSelectSize,
    });
  }, []);

  const saveProjectMeta = useCallback(async (partial: Partial<ProjectState>) => {
    if (!ready.current) return;
    const existing = await db.project.get(PROJECT_ID);
    if (!existing) {
      // Auto-init if somehow missing (defensive)
      await initProject();
      return saveProjectMeta(partial);
    }
    const updated: ProjectRow = {
      ...existing,
      ...partial,
      updatedAt: Date.now(),
    };
    await db.project.put(updated);
    setProject((prev) => prev ? { ...prev, ...partial } : null);
  }, [initProject]);

  // ── Files ──────────────────────────────────────────────────────────────────

  const saveFile = useCallback(async (file: Omit<StoredFile, "id">): Promise<StoredFile> => {
    const row: FileRow = {
      name: file.name,
      size: file.size,
      content: file.content,
      role: file.role,
      validationStatus: file.validationStatus,
      uploadedAt: file.uploadedAt.getTime(),
    };
    const generatedId = await db.files.add(row);
    const stored: StoredFile = {
      ...file,
      id: String(generatedId),
    };
    setFiles((prev) => [...prev, stored]);
    return stored;
  }, []);

  const saveFiles = useCallback(async (incoming: Omit<StoredFile, "id">[]): Promise<StoredFile[]> => {
    const rows: FileRow[] = incoming.map((f) => ({
      name: f.name,
      size: f.size,
      content: f.content,
      role: f.role,
      validationStatus: f.validationStatus,
      uploadedAt: f.uploadedAt.getTime(),
    }));

    const ids = await db.files.bulkAdd(rows, { allKeys: true });

    const stored: StoredFile[] = incoming.map((f, i) => ({
      ...f,
      id: String(ids[i]),
    }));

    setFiles((prev) => [...prev, ...stored]);
    return stored;
  }, []);

  const updateFileRole = useCallback(async (fileId: string, role: FileRole) => {
    const numericId = Number(fileId);
    await db.files.update(numericId, { role });
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, role } : f))
    );
  }, []);

  const updateFileContent = useCallback(async (fileId: string, content: string) => {
    const numericId = Number(fileId);
    await db.files.update(numericId, { content, size: new Blob([content]).size });
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, content, size: new Blob([content]).size } : f))
    );
  }, []);

  const updateFileValidation = useCallback(async (fileId: string, status: "valid" | "invalid" | "pending") => {
    const numericId = Number(fileId);
    await db.files.update(numericId, { validationStatus: status });
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, validationStatus: status } : f))
    );
  }, []);

  const removeFile = useCallback(async (fileId: string) => {
    const numericId = Number(fileId);
    await db.files.delete(numericId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  // ── Cycles ─────────────────────────────────────────────────────────────────

  const saveCycle = useCallback(async (cycle: Omit<CycleSnapshot, "iteration"> & {
    iteration: number;
    incrementContent: string;
    residualContent: string;
    evaluationContent: string;
  }) => {
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

    // Upsert — if user somehow re-runs the same cycle number, overwrite
    const existing = await db.cycles.where("cycleNumber").equals(cycle.iteration).first();
    if (existing) {
      await db.cycles.update(existing.id!, row);
    } else {
      await db.cycles.add(row);
    }

    setCycleHistory((prev) => {
      const filtered = prev.filter((s) => s.iteration !== cycle.iteration);
      return [...filtered, {
        iteration: cycle.iteration,
        precision: cycle.precision,
        recall: cycle.recall,
        f1: cycle.f1,
        annotatedCount: cycle.annotatedCount,
      }].sort((a, b) => a.iteration - b.iteration);
    });
  }, []);

  const getCycleContent = useCallback(async (cycleNumber: number) => {
    const row = await db.cycles.where("cycleNumber").equals(cycleNumber).first();
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
    // Clear any existing annotations for this cycle, then bulk insert.
    // This is the "training just finished, here are the new words" path.
    await db.annotations.where("cycleNumber").equals(cycleNumber).delete();

    const rows: AnnotationRow[] = words.map((w) => ({
      cycleNumber,
      wordId: w.id,
      word: w.word,
      confidence: w.confidence,
      boundaries: w.boundaries,
      confirmed: false,
    }));

    await db.annotations.bulkAdd(rows);
  }, []);

  const confirmAnnotation = useCallback(async (
    cycleNumber: number,
    wordId: string,
    boundaries: MorphemeBoundary[]
  ) => {
    const row = await db.annotations
      .where("[cycleNumber+wordId]")
      .equals([cycleNumber, wordId])
      .first();

    if (row?.id != null) {
      await db.annotations.update(row.id, { boundaries, confirmed: true });
    }
  }, []);

  const loadAnnotations = useCallback(async (cycleNumber: number): Promise<AnnotationWord[]> => {
    const rows = await db.annotations
      .where("cycleNumber")
      .equals(cycleNumber)
      .toArray();

    return rows.map((r) => ({
      id: r.wordId,
      word: r.word,
      confidence: r.confidence,
      boundaries: r.boundaries,
    }));
  }, []);

  const getConfirmedCount = useCallback(async (cycleNumber: number): Promise<number> => {
    return db.annotations
      .where("cycleNumber")
      .equals(cycleNumber)
      .filter((r) => r.confirmed)
      .count();
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const clearAll = useCallback(async () => {
    await db.transaction("rw", [db.project, db.files, db.cycles, db.annotations], async () => {
      await db.project.clear();
      await db.files.clear();
      await db.cycles.clear();
      await db.annotations.clear();
    });
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
    saveFiles,
    updateFileRole,
    updateFileContent,
    updateFileValidation,
    removeFile,
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

function fileRowToStoredFile(row: FileRow): StoredFile {
  return {
    id: String(row.id),
    name: row.name,
    size: row.size,
    content: row.content,
    role: row.role,
    validationStatus: row.validationStatus,
    uploadedAt: new Date(row.uploadedAt),
  };
}

function cycleRowToSnapshot(row: CycleRow): CycleSnapshot {
  return {
    iteration: row.cycleNumber,
    precision: row.precision,
    recall: row.recall,
    f1: row.f1,
    annotatedCount: row.annotatedCount,
  };
}