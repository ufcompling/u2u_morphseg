/**
 * useAnnotationState.ts
 * Location: src/hooks/useAnnotationState.ts
 *
 * Purpose:
 *   Manages the annotation word list and boundary editing state.
 *   Reusable for any annotation workflow — morphological segmentation
 *   today, but could serve POS tagging or other labeling tasks.
 *
 */

import { useState, useCallback } from "react";
import type { AnnotationWord, MorphemeBoundary } from "../lib/types";

export interface UseAnnotationStateReturn {
  annotationWords: AnnotationWord[];
  currentWordIndex: number;
  totalAnnotationWords: number;

  /** Replace the full word list (called after training completes). */
  setAnnotationWords: (words: AnnotationWord[]) => void;
  /** Update boundaries for a single word by ID. */
  updateBoundaries: (wordId: string, boundaryIndices: number[]) => void;
  /** Reset to empty state for a new cycle. */
  resetAnnotations: () => void;
}

export function useAnnotationState(): UseAnnotationStateReturn {
  const [annotationWords, setAnnotationWordsInternal] = useState<AnnotationWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const setAnnotationWords = useCallback((words: AnnotationWord[]) => {
    setAnnotationWordsInternal(words);
    setCurrentWordIndex(0);
  }, []);

  const updateBoundaries = useCallback(
    (wordId: string, boundaryIndices: number[]) => {
      const boundaries: MorphemeBoundary[] = boundaryIndices.map((index) => ({ index }));
      setAnnotationWordsInternal((prev) =>
        prev.map((w) => (w.id === wordId ? { ...w, boundaries } : w))
      );
    },
    []
  );

  const resetAnnotations = useCallback(() => {
    setAnnotationWordsInternal([]);
    setCurrentWordIndex(0);
  }, []);

  return {
    annotationWords,
    currentWordIndex,
    totalAnnotationWords: annotationWords.length,
    setAnnotationWords,
    updateBoundaries,
    resetAnnotations,
  };
}