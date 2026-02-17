"use client";

import { useState } from "react";
import type { TrainingResult, CycleSnapshot } from "../../lib/types";

// ============================================================
// Results & Export Stage
// ============================================================

interface ResultsExportProps {
  result: TrainingResult | null;
  previousResult: TrainingResult | null;
  cycleHistory: CycleSnapshot[];
  onDownloadIncrement: () => void;
  onDownloadResidual: () => void;
  onDownloadEvaluation: () => void;
  onNewCycle: () => void;
  onStartOver: () => void;
}

export function ResultsExportStage({
  result,
  previousResult,
  cycleHistory,
  onDownloadIncrement,
  onDownloadResidual,
  onDownloadEvaluation,
  onNewCycle,
  onStartOver,
}: ResultsExportProps) {
  // Selected cycle index for timeline navigation
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number | null>(null);

  if (!result) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground/30">
          No results available yet
        </p>
      </div>
    );
  }

  // Determine which cycle's data to display
  const isViewingCurrent = selectedCycleIndex === null || selectedCycleIndex === cycleHistory.length - 1;
  const viewedCycle = isViewingCurrent
    ? { f1: result.f1, precision: result.precision, recall: result.recall, annotatedCount: result.annotatedCount, iteration: result.iterationNumber }
    : cycleHistory[selectedCycleIndex!];

  // Deltas are only shown when viewing the current (latest) cycle
  const prevCycle = isViewingCurrent && cycleHistory.length >= 2
    ? cycleHistory[cycleHistory.length - 2]
    : null;
  const f1Delta = prevCycle ? viewedCycle.f1 - prevCycle.f1 : null;
  const precisionDelta = prevCycle ? viewedCycle.precision - prevCycle.precision : null;
  const recallDelta = prevCycle ? viewedCycle.recall - prevCycle.recall : null;

  const recommendation = getRecommendation(result, f1Delta, cycleHistory);
  const config = RECOMMENDATION_CONFIG[recommendation];

  return (
    <div className="flex flex-col">

      {/* ==========================================================
          1. TIMELINE CONTROL
          Clickable cycle dots — left-to-right, oldest to newest.
          Active dot = selected cycle. Connecting line = continuity.
          ========================================================== */}
      {cycleHistory.length > 1 && (
        <div className="px-6 py-4 border-b border-border/10">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-0">
              {cycleHistory.map((snap, i) => {
                const isSelected = isViewingCurrent ? i === cycleHistory.length - 1 : i === selectedCycleIndex;
                const isLatest = i === cycleHistory.length - 1;
                // Older cycles fade left-to-right
                const fadeOpacity = isSelected ? 1 : 0.25 + (i / (cycleHistory.length - 1)) * 0.4;

                return (
                  <div key={snap.iteration} className="flex items-center">
                    {/* Cycle dot — large hit area, small visual */}
                    <div className="relative group">
                      <button
                        onClick={() => setSelectedCycleIndex(isLatest ? null : i)}
                        className="w-10 h-10 flex items-center justify-center -mx-2"
                        aria-label={`View cycle ${snap.iteration}`}
                      >
                        <div
                          className={`rounded-full transition-all duration-200 ${
                            isSelected
                              ? "w-3.5 h-3.5 bg-primary shadow-md shadow-primary/30"
                              : "w-2 h-2 bg-primary hover:w-2.5 hover:h-2.5"
                          }`}
                          style={{ opacity: fadeOpacity }}
                        />
                      </button>

                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-10">
                        <div className="bg-card border border-border/30 rounded-lg px-3 py-2 shadow-xl shadow-black/30 whitespace-nowrap">
                          <p className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                            Cycle {snap.iteration}
                          </p>
                          <p className="font-mono text-sm font-bold text-foreground tabular-nums mt-0.5">
                            F1: {(snap.f1 * 100).toFixed(1)}%
                          </p>
                          <p className="font-mono text-[9px] text-muted-foreground/40 tabular-nums mt-0.5">
                            {snap.annotatedCount} annotated
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Connecting line */}
                    {i < cycleHistory.length - 1 && (
                      <div className="w-8 h-px bg-primary/15" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================
          2. FOCUSED METRICS — vertical spine alignment
          Cycle label -> F1 dominant -> P/R subordinate
          ========================================================== */}
      <div className="px-6 py-6 border-b border-border/10">
        {/* Cycle label — clarifies what the user is looking at */}
        <div className="text-center mb-4">
          <span className="font-mono text-[9px] text-muted-foreground/40 uppercase tracking-widest">
            Cycle {viewedCycle.iteration}
            {isViewingCurrent ? " (current)" : " (completed)"}
          </span>
        </div>

        {/* F1 — dominant, vertically centered on spine */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[8px] text-muted-foreground/25 uppercase tracking-widest mb-1">
            F1 Score
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-6xl font-bold text-foreground tabular-nums tracking-tighter leading-none">
              {(viewedCycle.f1 * 100).toFixed(1)}
            </span>
            <span className="font-mono text-lg text-muted-foreground/20">%</span>
          </div>
          {f1Delta !== null && isViewingCurrent && (
            <span className={`font-mono text-xs font-semibold tabular-nums mt-1.5 ${deltaColor(f1Delta)}`}>
              {formatDelta(f1Delta)} from previous cycle
            </span>
          )}
        </div>

        {/* P/R — flanking the spine, reduced weight */}
        <div className="flex items-center justify-center gap-10 mt-5">
          <SubMetric
            label="Precision"
            value={viewedCycle.precision}
            delta={isViewingCurrent ? precisionDelta : null}
          />
          <div className="w-px h-8 bg-border/8" />
          <SubMetric
            label="Recall"
            value={viewedCycle.recall}
            delta={isViewingCurrent ? recallDelta : null}
          />
        </div>

        {/* Annotated count — on the spine */}
        <div className="mt-4 text-center">
          <span className="font-mono text-[10px] text-muted-foreground/25">
            <strong className="text-foreground/50 font-semibold">{viewedCycle.annotatedCount}</strong>{" "}
            words annotated
          </span>
        </div>
      </div>

      {/* ==========================================================
          3. DECISION SUMMARY — only for current cycle
          ========================================================== */}
      {isViewingCurrent && (
        <div className="px-6 py-4 border-b border-border/10">
          <div className="flex items-center gap-3">
            <span
              className={`shrink-0 px-2 py-0.5 rounded-md border font-mono text-[9px] font-semibold uppercase tracking-wider ${config.badgeClass}`}
            >
              {config.badge}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground/50">
              {config.heading}
            </span>
          </div>
        </div>
      )}

      {/* ==========================================================
          4. ARTIFACTS — compressed inline chips
          ========================================================== */}
      <div className="px-6 py-4 border-b border-border/10">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] text-muted-foreground/25 uppercase tracking-widest shrink-0">
            Export
          </span>
          <div className="flex gap-2">
            <ExportChip label="Increment" onClick={onDownloadIncrement} />
            <ExportChip label="Residual" onClick={onDownloadResidual} />
            <ExportChip label="Evaluation" onClick={onDownloadEvaluation} />
          </div>
        </div>
      </div>

      {/* ==========================================================
          5. NEXT ACTION — clear primary CTA right-aligned
          ========================================================== */}
      <footer className="px-6 py-4 flex items-center justify-between">
        <button
          onClick={onStartOver}
          className="font-mono text-[10px] text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors"
        >
          Reset project
        </button>
        {isViewingCurrent && (
          <button
            onClick={onNewCycle}
            className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-mono text-[11px] font-semibold tracking-wide transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary active:scale-[0.97]"
          >
            <LoopIcon />
            <span>Continue to Cycle {result.iterationNumber + 1}</span>
          </button>
        )}
        {!isViewingCurrent && (
          <button
            onClick={() => setSelectedCycleIndex(null)}
            className="font-mono text-[11px] text-primary/70 hover:text-primary transition-colors"
          >
            Back to current cycle
          </button>
        )}
      </footer>
    </div>
  );
}

// ============================================================
// Recommendation logic
// ============================================================

type Recommendation = "keep-going" | "converging" | "strong";

function getRecommendation(
  result: TrainingResult,
  f1Delta: number | null,
  history: CycleSnapshot[]
): Recommendation {
  // TODO [BACKEND]: Replace with real convergence detection
  // pseudocode:
  //   if result.f1 >= 0.93: return "strong"
  //   if len(history) >= 3:
  //     last_deltas = [h[i].f1 - h[i-1].f1 for i in range(-2, 0)]
  //     if all(abs(d) < 0.005 for d in last_deltas): return "converging"
  //   return "keep-going"

  if (result.f1 >= 0.93) return "strong";
  if (history.length >= 3 && f1Delta !== null && Math.abs(f1Delta) < 0.005) return "converging";
  return "keep-going";
}

const RECOMMENDATION_CONFIG = {
  "keep-going": {
    badge: "Improving",
    badgeClass: "bg-primary/15 text-primary border-primary/20",
    heading: "Model accuracy improved. Continue annotating.",
  },
  converging: {
    badge: "Converging",
    badgeClass: "bg-foreground/5 text-muted-foreground border-border/30",
    heading: "Diminishing returns detected. Consider stopping.",
  },
  strong: {
    badge: "Strong",
    badgeClass: "bg-primary/15 text-primary border-primary/20",
    heading: "Performance target reached.",
  },
};

// ============================================================
// Sub-components
// ============================================================

function SubMetric({ label, value, delta }: { label: string; value: number; delta: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[72px]">
      <span className="font-mono text-[8px] text-muted-foreground/25 uppercase tracking-widest">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold text-muted-foreground/60 tabular-nums">
        {(value * 100).toFixed(1)}
      </span>
      {delta !== null && (
        <span className={`font-mono text-[9px] tabular-nums ${deltaColor(delta)}`}>
          {formatDelta(delta)}
        </span>
      )}
    </div>
  );
}

const EXPORT_TOOLTIPS: Record<string, string> = {
  Increment:
    "Newly annotated data from this cycle, ready to merge into your training set.",
  Residual:
    "Remaining unannotated data the model has not yet been asked to label.",
  Evaluation:
    "Per-word predictions with confidence scores from the evaluation set.",
};

function ExportChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="relative group/tip">
      <button
        onClick={onClick}
        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/5 border border-border/10 hover:bg-secondary/15 hover:border-border/20 transition-all"
      >
        <DownloadIcon className="w-3 h-3 text-muted-foreground/20 group-hover:text-primary transition-colors" />
        <span className="font-mono text-[10px] text-muted-foreground/40 group-hover:text-foreground transition-colors">
          {label}
        </span>
      </button>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity duration-150 z-20">
        <div className="bg-card border border-border/30 rounded-lg px-3 py-2 shadow-xl shadow-black/30 w-52">
          <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed">
            {EXPORT_TOOLTIPS[label]}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Utilities
// ============================================================

function deltaColor(d: number): string {
  if (d > 0.001) return "text-primary";
  if (d < -0.001) return "text-red-400/70";
  return "text-muted-foreground/30";
}

function formatDelta(d: number): string {
  const sign = d >= 0 ? "+" : "";
  return `${sign}${(d * 100).toFixed(1)}`;
}

// ============================================================
// Icons
// ============================================================

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
