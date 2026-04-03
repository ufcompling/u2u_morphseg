import { useState, useCallback, useRef, useEffect } from "react";
import type { AnnotationWord } from "../../../lib/types";
import { ArrowIcon, UploadSmallIcon, CheckAllIcon, SnapshotIcon } from "../../../components/ui/icons";

function parseGoldFile(content: string): {
  lookup: Map<string, number[]>;
  separator: string;
  sampleLines: string[];
} {
  const lines = (content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const sampleLines = lines.slice(0, 3);

  // Auto-detect separator from first 20 lines
  const CANDIDATES = ["!", "+", "|", "-", "_"];
  const counts: Record<string, number> = {};
  for (const c of CANDIDATES) counts[c] = 0;
  for (const l of lines.slice(0, 20)) {
    const collapsed = l.replace(/\s+/g, "");
    for (const c of CANDIDATES) {
      if (collapsed.includes(c)) counts[c]++;
    }
  }
  const separator = CANDIDATES.reduce((best, c) => (counts[c] > counts[best] ? c : best), "!");

  const lookup = new Map<string, number[]>();
  for (const line of lines) {
    const collapsed = line.replace(/\s+/g, "");
    if (!collapsed) continue;

    const morphemes = collapsed.split(separator);
    const word = morphemes.join("");
    if (!word) continue;

    const boundaries: number[] = [];
    let offset = 0;
    for (let i = 0; i < morphemes.length - 1; i++) {
      offset += morphemes[i].length;
      boundaries.push(offset - 1);
    }
    lookup.set(word.toLowerCase(), boundaries);
  }

  return { lookup, separator, sampleLines };
}

interface AnnotationWorkspaceProps {
  words: AnnotationWord[];
  onUpdateBoundaries: (wordId: string, boundaryIndices: number[]) => void;
  onBulkUpdateBoundaries: (updates: Array<{ wordId: string; boundaryIndices: number[] }>) => void;
  onSubmit: () => void;
  onSkip: () => void;
  totalWords: number;
  currentIteration: number;
  onSnapshot: () => void;
}

export function AnnotationWorkspaceStage({
  words,
  onUpdateBoundaries,
  onBulkUpdateBoundaries,
  onSubmit,
  onSkip,
  totalWords,
  currentIteration,
  onSnapshot,
}: AnnotationWorkspaceProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [annotatedSet, setAnnotatedSet] = useState<Set<string>>(new Set());

  // Dev/testing: gold file auto-annotation
  const goldInputRef = useRef<HTMLInputElement>(null);
  const [goldMatchCount, setGoldMatchCount] = useState<number | null>(null);
  const [goldDebug, setGoldDebug] = useState<{
    separator: string;
    lookupSize: number;
    sampleLines: string[];
    sampleWordKey: string;
  } | null>(null);
  const [showDevTools, setShowDevTools] = useState(false);

  // Keep a ref so the async FileReader.onload always sees the latest words
  // without needing words/annotatedSet in useCallback deps.
  const wordsRef = useRef(words);
  const prevWordIdsRef = useRef<string>('');
  useEffect(() => {
    wordsRef.current = words;
    const wordIdsKey = words.map(w => w.id).join('|');
    if (wordIdsKey !== prevWordIdsRef.current) {
      prevWordIdsRef.current = wordIdsKey;
      setAnnotatedSet(new Set(words.filter(w => w.confirmed).map(w => w.id)));
      setGoldMatchCount(null);
      setGoldDebug(null);
    }
  }, [words]);

  const currentWord = words[focusIndex] ?? null;
  const annotatedCount = annotatedSet.size;
  const allDone = annotatedCount === totalWords && totalWords > 0;

  const handleConfirm = useCallback(() => {
    if (!currentWord) return;
    const boundaryIndices = currentWord.boundaries.map((b) => b.index);
    onUpdateBoundaries(currentWord.id, boundaryIndices);
    setAnnotatedSet((prev) => new Set(prev).add(currentWord.id));
    // Advance to next unannotated word, or stay if all done
    if (focusIndex < words.length - 1) {
      setFocusIndex((prev) => prev + 1);
    }
  }, [currentWord, focusIndex, words.length, onUpdateBoundaries]);

  const handlePrev = useCallback(() => {
    if (focusIndex > 0) setFocusIndex((prev) => prev - 1);
  }, [focusIndex]);

  const handleNext = useCallback(() => {
    if (focusIndex < words.length - 1) setFocusIndex((prev) => prev + 1);
  }, [focusIndex, words.length]);

  /**
   * Load a gold-standard file and auto-fill boundaries for all matching words,
   * then confirm ALL words in the batch so the submit button enables immediately.
   * Matched words get gold boundaries; unmatched keep the CRF-predicted boundaries.
   */
  const handleGoldFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const { lookup: goldLookup, separator, sampleLines } = parseGoldFile(content);
        const currentWords = wordsRef.current;

        const sampleWordKey = currentWords.length > 0
          ? currentWords[0].word.replace(/\s+/g, "").toLowerCase()
          : "";

        setGoldDebug({
          separator,
          lookupSize: goldLookup.size,
          sampleLines,
          sampleWordKey,
        });

        let matched = 0;
        const allUpdates = currentWords.map((w) => {
          const key = w.word.replace(/\s+/g, "").toLowerCase();
          const goldBoundaries = goldLookup.get(key);
          const boundaryIndices =
            goldBoundaries !== undefined
              ? goldBoundaries
              : w.boundaries.map((b) => b.index);
          if (goldBoundaries !== undefined) matched++;
          return { wordId: w.id, boundaryIndices };
        });

        // Single bulk call — updates React state and persists in one DB write
        onBulkUpdateBoundaries(allUpdates);

        setAnnotatedSet(new Set(currentWords.map((w) => w.id)));
        setGoldMatchCount(matched);

        console.debug(`[gold] sep="${separator}" lookup=${goldLookup.size} matched=${matched}/${currentWords.length}`,
          "\n  sample word key:", JSON.stringify(sampleWordKey),
          "\n  sample gold lines:", sampleLines,
          "\n  first gold key:", [...goldLookup.keys()][0]);
      };
      reader.onerror = () => {
        console.error("[AnnotationWorkspace] Failed to read gold file:", reader.error);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [onBulkUpdateBoundaries]
  );

  /** Confirm all words at once using current boundaries (CRF predictions as-is). */
  const handleConfirmAll = useCallback(() => {
    const currentWords = wordsRef.current;
    currentWords.forEach((w) => {
      const boundaryIndices = w.boundaries.map((b) => b.index);
      onUpdateBoundaries(w.id, boundaryIndices);
    });
    setAnnotatedSet(new Set(currentWords.map((w) => w.id)));
  }, [onUpdateBoundaries]);

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">
              Annotation Workspace
            </h2>
            <p className="font-mono text-[11px] text-muted-foreground/70 mt-1">
              Click between letters to mark morpheme boundaries
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-secondary/20 flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                Cycle
              </span>
              <span className="font-mono text-[11px] text-foreground tabular-nums font-medium">
                {currentIteration}
              </span>
            </div>
          </div>
        </div>

        {/* Context banner */}
        <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="font-mono text-[11px] text-foreground/90 leading-relaxed">
            <span className="text-primary font-medium">Why these words?</span>{" "}
            The model selected {totalWords} samples it is{" "}
            <span className="text-primary font-medium">least confident</span>{" "}
            about. Your corrections have the highest impact on accuracy.
          </p>
        </div>

        {/* -- Dev/Testing Tools -- */}
        <div className="mt-3">
          <button
            onClick={() => setShowDevTools((prev) => !prev)}
            className="font-mono text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          >
            {showDevTools ? "▾ Hide testing tools" : "▸ Testing tools"}
          </button>

          {showDevTools && (
            <div className="mt-2 px-4 py-3 rounded-lg bg-secondary/10 border border-dashed border-border/20">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Gold file auto-annotate */}
                <input
                  ref={goldInputRef}
                  type="file"
                  accept=".tgt,.txt"
                  onChange={handleGoldFile}
                  className="hidden"
                />
                <button
                  onClick={() => goldInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/20 border border-border/20 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/30 transition-all"
                >
                  <UploadSmallIcon />
                  <span>Load Gold File</span>
                </button>

                {/* Confirm all as-is */}
                <button
                  onClick={handleConfirmAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/20 border border-border/20 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/30 transition-all"
                >
                  <CheckAllIcon />
                  <span>Confirm All As-Is</span>
                </button>

                {/* Status message */}
                {goldMatchCount !== null && (
                  <span className={`font-mono text-[10px] ${goldMatchCount > 0 ? "text-primary/70" : "text-red-400/70"}`}>
                    {goldMatchCount > 0 ? "✓" : "✗"} {goldMatchCount}/{totalWords} words matched from gold file
                  </span>
                )}
              </div>

              {/* Debug dump — shown when 0 matches to explain coverage gap */}
              {goldDebug && goldMatchCount === 0 && (
                <div className="mt-2 p-2 rounded bg-secondary/10 border border-border/20 space-y-1">
                  <p className="font-mono text-[9px] text-muted-foreground/70 font-semibold">Coverage gap — gold file loaded correctly but no overlap with this batch:</p>
                  <p className="font-mono text-[9px] text-muted-foreground/50">
                    Gold entries: <span className="text-foreground/70">{goldDebug.lookupSize}</span>
                    {" · "}Separator: <span className="text-foreground/70">&quot;{goldDebug.separator}&quot;</span>
                    {" · "}Sample batch word: <span className="text-foreground/70">&quot;{goldDebug.sampleWordKey}&quot;</span>
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground/40">
                    The CRF selected words from your unannotated pool that aren&apos;t in this gold file.
                    Use <span className="text-foreground/60">Confirm All As-Is</span> to accept CRF predictions, or load a gold file that covers your unannotated pool.
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground/30">Gold file sample: {goldDebug.sampleLines.join(" · ")}</p>
                </div>
              )}
              <p className="font-mono text-[9px] text-muted-foreground/30 mt-2">
                Gold file applies correct boundaries to matched words and confirms the entire batch.
                Confirm All marks every word as done without changing boundaries.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Progress rail */}
      <div className="px-6 py-4 border-b border-border/10">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {annotatedCount} of {totalWords} annotated
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
            {totalWords > 0 ? Math.round((annotatedCount / totalWords) * 100) : 0}%
          </span>
        </div>
        {/* Dot rail showing each word */}
        <div className="flex items-center gap-1 flex-wrap">
          {words.map((w, i) => {
            const isAnnotated = annotatedSet.has(w.id);
            const isCurrent = i === focusIndex;
            return (
              <button
                key={w.id}
                onClick={() => setFocusIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  isCurrent
                    ? "bg-primary scale-125 ring-2 ring-primary/30"
                    : isAnnotated
                      ? "bg-primary/60"
                      : "bg-border/40 hover:bg-border/60"
                }`}
                aria-label={`Word ${i + 1}`}
              />
            );
          })}
        </div>
      </div>

      {/* Focused word card */}
      <div className="px-6 py-8 border-b border-border/20 min-h-[240px] flex items-center justify-center">
        {currentWord ? (
          <div className="w-full max-w-lg">
            {/* Word number + confidence */}
            <div className="flex items-center justify-between mb-6">
              <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                Word {focusIndex + 1} of {totalWords}
              </span>
              <div className="flex items-center gap-2">
                <div className="w-12 h-1 rounded-full bg-border/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${currentWord.confidence * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                  {(currentWord.confidence * 100).toFixed(0)}% conf
                </span>
              </div>
            </div>

            {/* Interactive character strip */}
            <WordEditor
              word={currentWord}
              onUpdateBoundaries={onUpdateBoundaries}
            />

            {/* Navigation + confirm */}
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={handlePrev}
                disabled={focusIndex === 0}
                className="px-4 py-2 rounded-lg font-mono text-xs text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all disabled:opacity-20 disabled:pointer-events-none"
              >
                Prev
              </button>

              <button
                onClick={handleConfirm}
                className={`px-6 py-2.5 rounded-xl font-mono text-xs font-semibold tracking-wide transition-all active:scale-[0.97] ${
                  annotatedSet.has(currentWord.id)
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {annotatedSet.has(currentWord.id) ? "Confirmed" : "Confirm"}
              </button>

              <button
                onClick={handleNext}
                disabled={focusIndex === words.length - 1}
                className="px-4 py-2 rounded-lg font-mono text-xs text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all disabled:opacity-20 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="font-mono text-sm text-muted-foreground/70">
              No words to annotate
            </p>
          </div>
        )}
      </div>

      {/* Help legend */}
      <div className="px-6 py-3 border-b border-border/10 bg-secondary/5">
        <div className="flex items-center gap-6 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-3 rounded-full bg-primary" />
            <span className="font-mono text-[10px] text-muted-foreground/70">
              boundary
            </span>
          </div>
          <span className="w-1 h-1 rounded-full bg-border/30" />
          <span className="font-mono text-[10px] text-muted-foreground/70">
            Click gaps to toggle
          </span>
          <span className="w-1 h-1 rounded-full bg-border/30" />
          <span className="font-mono text-[10px] text-muted-foreground/70">
            Use dots above to jump
          </span>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 flex items-center justify-between">
        <div className="relative">
          {showSkipConfirm ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/15 border border-border/20">
              <span className="font-mono text-[11px] text-muted-foreground/70">
                Skip all? Words return next cycle.
              </span>
              <button
                onClick={() => { onSkip(); setShowSkipConfirm(false); }}
                className="px-3 py-1 rounded-md bg-secondary/30 font-mono text-[11px] text-foreground hover:bg-secondary/50 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="px-3 py-1 rounded-md font-mono text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSkipConfirm(true)}
              className="group px-4 py-2.5 rounded-xl font-mono text-xs text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all"
            >
              <span>Skip batch</span>
              <span className="block font-mono text-[9px] text-muted-foreground/70 mt-0.5 group-hover:text-muted-foreground/70 transition-colors">
                Words will reappear next cycle
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">

          {/* Save snapshot */}
          <button
            onClick={onSnapshot}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/40 bg-secondary/10 font-mono text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all"
            title="Download a snapshot of your current work"
          >
            <SnapshotIcon />
            <span>Snapshot</span>
          </button>
        </div>

        <button
          onClick={onSubmit}
          disabled={!allDone}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-mono text-xs font-semibold tracking-wide transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
        >
          <span>Submit All ({annotatedCount}/{totalWords})</span>
          <ArrowIcon />
        </button>
      </footer>
    </div>
  );
}

// ---- Word Editor (single focused word) ----

function WordEditor({
  word,
  onUpdateBoundaries,
}: {
  word: AnnotationWord;
  onUpdateBoundaries: (wordId: string, boundaryIndices: number[]) => void;
}) {
  const characters = word.word.split("");
  const boundarySet = new Set<number>(word.boundaries.map((b) => b.index));

  const toggleBoundary = (charIndex: number) => {
    const newBoundaries: number[] = boundarySet.has(charIndex)
      ? [...boundarySet].filter((i) => i !== charIndex)
      : [...boundarySet, charIndex].sort((a, b) => a - b);
    onUpdateBoundaries(word.id, newBoundaries);
  };

  // Build morpheme preview, filtering out empty/whitespace morphemes
  let morphemes: string[] = [];
  let start = 0;
  const sorted: number[] = [...boundarySet].sort((a, b) => a - b);
  for (const b of sorted) {
    const m = word.word.slice(start, b + 1);
    if (m.trim().length > 0) morphemes.push(m);
    start = b + 1;
  }
  if (start < word.word.length) {
    const m = word.word.slice(start);
    if (m.trim().length > 0) morphemes.push(m);
  }

  return (
    <div>
      {/* Large interactive characters */}
      <div className="flex items-center justify-center">
        {characters.map((char, i) => (
          <div key={i} className="flex items-center">
            <span className="font-mono text-3xl text-foreground select-none px-0.5">
              {char}
            </span>
            {i < characters.length - 1 && (
              <button
                onClick={() => toggleBoundary(i)}
                className="group relative w-6 h-12 flex items-center justify-center cursor-pointer"
                aria-label={boundarySet.has(i) ? "Remove boundary" : "Add boundary"}
              >
                <div
                  className={`w-0.5 rounded-full transition-all ${
                    boundarySet.has(i)
                      ? "h-10 bg-primary"
                      : "h-6 bg-transparent group-hover:bg-muted-foreground/0"
                  }`}
                />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Morpheme preview */}
      <div className="flex items-center justify-center gap-2 mt-5 min-h-[28px]">
        {morphemes.length > 1 ? (
          morphemes.map((m, i) => (
            <span
              key={i}
              className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/15 font-mono text-sm text-primary"
            >
              {m}
            </span>
          ))
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground/30 italic">
            No boundaries set -- word is treated as a single morpheme
          </span>
        )}
      </div>
    </div>
  );
}