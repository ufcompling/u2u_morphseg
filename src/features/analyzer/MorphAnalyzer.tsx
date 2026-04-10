// Main application shell for TurtleShell active learning workflow.

import { useState, useEffect, useRef } from "react";
import { useTurtleshell, type UseTurtleshellReturn } from "../../hooks/useTurtleShell";
import { TurtleShellBackground, StepIndicator } from "../../components/layout";
import { type WorkflowStage } from "../../lib/types";
import {
  DatasetIngestion,
  ModelConfigStage,
  TrainingProgressStage,
  AnnotationWorkspaceStage,
  ResultsExportStage,
} from "./stages";

export function MorphAnalyzer() {
  const ts = useTurtleshell();

  const [showOverlay, setShowOverlay] = useState(true);
  const [allReady, setAllReady]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ts.pyodideReady && ts.indexedDBReady && !allReady) {
      setAllReady(true);

      // Unmount overlay after its fade completes.
      // App content is already visible underneath — no separate appVisible state needed.
      timerRef.current = setTimeout(() => setShowOverlay(false), 900);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [ts.pyodideReady, ts.indexedDBReady, allReady]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative isolate">
      <TurtleShellBackground />

      <main className="w-full max-w-4xl relative z-10">
        <div className="bg-card/98 backdrop-blur-3xl border border-border/20 rounded-2xl shadow-2xl shadow-black/40 overflow-visible ring-1 ring-white/5"
          style={{ backfaceVisibility: "hidden", transform: "translate3d(0,0,0)" }}
        >

          <header className="px-6 py-4 flex items-center border-b border-border/20 bg-secondary/5">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-mono text-base font-semibold tracking-tight text-foreground">
                  turtleshell
                </h1>
                <span className="px-1.5 py-0.5 rounded bg-secondary/30 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                  v1.0
                </span>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground/50 mt-0.5">
                morphological segmentation
              </p>
            </div>
          </header>

          {/* App content always rendered — overlay sits on top */}
          <div className="relative min-h-[440px]">
            <div>
              {ts.pyodideError && !showOverlay && (
                <ErrorBanner
                  message={`Pyodide failed to load: ${ts.pyodideError}`}
                  hint="Check your connection — Pyodide downloads ~10MB on first run. Private browsing may block required storage."
                />
              )}
              <div className="border-b border-border/20">
                <StepIndicator
                  currentStage={ts.currentStage}
                  completedStages={ts.completedStages}
                />
              </div>
              <AnimatedStageRenderer ts={ts} />
            </div>

            {showOverlay && (
              <InitOverlay
                pyodideReady={ts.pyodideReady}
                indexedDBReady={ts.indexedDBReady}
                pyodideError={ts.pyodideError}
                allReady={allReady}
              />
            )}
          </div>
        </div>

        <p className="mt-5 text-center font-mono text-[9px] text-muted-foreground/30 tracking-wider">
          pyodide + indexeddb
        </p>
      </main>
    </div>
  );
}

// ── Loading label hook ────────────────────────────────────────────────────────

const TIMED_STAGES = [
  { after: 0,     label: "Starting up" },
  { after: 2500,  label: "Loading Python runtime" },
  { after: 7000,  label: "Installing packages" },
  { after: 14000, label: "Almost ready" },
] as const;

function useLoadingLabel(pyodideReady: boolean, indexedDBReady: boolean, allReady: boolean) {
  const startRef = useRef(Date.now());
  const [timedLabel, setTimedLabel] = useState<string>(TIMED_STAGES[0].label);

  useEffect(() => {
    if (allReady) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const stage = [...TIMED_STAGES].reverse().find((s) => elapsed >= s.after);
      if (stage) setTimedLabel(stage.label);
    }, 500);
    return () => clearInterval(id);
  }, [allReady]);

  if (allReady)                        return "Ready";
  if (pyodideReady && !indexedDBReady) return "Opening database";
  return timedLabel;
}

// ── Init overlay ─────────────────────────────────────────────────────────────

const LOGO = `${import.meta.env.BASE_URL}turtleshell_logo.png`;

const ICON_SIZE = 96;
const GAP       = 18;
const RING_R    = ICON_SIZE / 2 + GAP;
const STROKE_W  = 1.5;
const CIRCUMF   = 2 * Math.PI * RING_R;
const SVG_SIZE  = (RING_R + STROKE_W + 2) * 2;
const C         = SVG_SIZE / 2;

const ORBIT_R   = RING_R + 16;
const ORBIT_SVG = (ORBIT_R + STROKE_W + 2) * 2;
const OC        = ORBIT_SVG / 2;

// Arc length in indeterminate mode — 35% of the ring
const INDET_ARC = CIRCUMF * 0.35;

const HINTS = [
  "Selects the words the model is least sure about",
  "Your corrections retrain the model each cycle",
  "Active learning reduces labeling effort",
  "Uncertainty sampling finds hard cases first",
  "Each annotated word compounds model accuracy",
];

interface InitOverlayProps {
  pyodideReady: boolean;
  indexedDBReady: boolean;
  pyodideError: string | null;
  allReady: boolean;
}

function InitOverlay({ pyodideReady, indexedDBReady, pyodideError, allReady }: InitOverlayProps) {
  const hasError   = !!pyodideError;
  const readyCount = (pyodideReady ? 1 : 0) + (indexedDBReady ? 1 : 0);

  // Single numeric progress value: 0 → 0.5 → 1.0
  // We start at a small non-zero value so the arc is visible immediately —
  // this avoids the jarring "nothing then something" at t=0.
  const progress = hasError ? 0.3 : readyCount > 0 ? readyCount / 2 : 0;

  // ── Single arc element, two modes ──────────────────────────────────────────
  //
  // Indeterminate (progress === 0): short arc + stroke-dashoffset animation
  //   makes the arc travel around the ring. dasharray = "ARC GAP" so the arc
  //   is always ARC_LENGTH long.
  //
  // Determinate (progress > 0): dasharray = full circumference, dashoffset
  //   controls how much is filled. CSS transition handles the smooth fill.
  //
  // Because it's always the SAME <circle> element, React never unmounts it
  // and there's no position snap between modes.

  const isIndeterminate = progress === 0 && !hasError;

  const arcDashArray  = isIndeterminate
    ? `${INDET_ARC} ${CIRCUMF - INDET_ARC}`
    : `${CIRCUMF} ${CIRCUMF}`;

  const arcDashOffset = isIndeterminate
    ? 0                                  // animation drives it
    : CIRCUMF * (1 - progress);

  const arcColor = hasError ? "rgb(248 113 113)" : "var(--color-primary, #6b8f3a)";

  const arcStyle: React.CSSProperties = isIndeterminate
    ? {
        animation: `ts-chase ${(CIRCUMF / 140).toFixed(1)}s linear infinite`,
        opacity: 0.7,
      }
    : {
        // When transitioning OUT of indeterminate the browser will smoothly
        // interpolate strokeDashoffset from wherever the animation left it.
        transition: "stroke-dashoffset 900ms cubic-bezier(0, 0, 0.2, 1), stroke-dasharray 600ms ease, opacity 300ms ease",
        opacity: 1,
      };

  // Cycling hint
  const [hintIndex, setHintIndex]   = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    if (allReady) return;
    const id = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex((i) => (i + 1) % HINTS.length);
        setHintVisible(true);
      }, 400);
    }, 3200);
    return () => clearInterval(id);
  }, [allReady]);

  const loadingLabel = useLoadingLabel(pyodideReady, indexedDBReady, allReady);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-card/98"
      style={{
        opacity: allReady ? 0 : 1,
        pointerEvents: allReady ? "none" : "auto",
        // Fade out. The app content is already rendered below — no blank gap.
        transition: "opacity 700ms cubic-bezier(0.4, 0, 1, 1)",
        minHeight: 420,
        zIndex: 10,
      }}
    >
      {/* Ring + icon */}
      <div className="relative flex items-center justify-center" style={{ marginBottom: 36 }}>

        {/* Outer orbit — slow dashed rotation */}
        <svg
          width={ORBIT_SVG} height={ORBIT_SVG}
          viewBox={`0 0 ${ORBIT_SVG} ${ORBIT_SVG}`}
          className="absolute"
          style={{ animation: "ts-orbit 20s linear infinite" }}
        >
          <circle
            cx={OC} cy={OC} r={ORBIT_R}
            fill="none" stroke="currentColor"
            strokeWidth={0.75} strokeDasharray="2 22" strokeLinecap="round"
            className="text-border/20"
          />
        </svg>

        {/* Progress ring — always rotated so arc starts at top */}
        <svg
          width={SVG_SIZE} height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="absolute"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx={C} cy={C} r={RING_R}
            fill="none" stroke="currentColor"
            strokeWidth={STROKE_W} className="text-border/15"
          />

          {/* Single arc — indeterminate or determinate, never remounted */}
          <circle
            cx={C} cy={C} r={RING_R}
            fill="none"
            stroke={arcColor}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            strokeDasharray={arcDashArray}
            strokeDashoffset={arcDashOffset}
            style={arcStyle}
          />
        </svg>

        {/* logo */}
        <img
          src={LOGO} alt="TurtleShell"
          width={ICON_SIZE} height={ICON_SIZE}
          draggable={false}
          style={{
            position: "relative", zIndex: 1, borderRadius: 16,
            opacity: hasError ? 0.4 : 1,
            transition: "opacity 400ms ease",
            userSelect: "none",
          }}
        />
      </div>

      {/* Status label */}
      <div style={{ minHeight: 20, marginBottom: 18, textAlign: "center" }}>
        <p className="font-mono text-[10px] text-muted-foreground/80 uppercase tracking-widest">
          {hasError ? "Initialization failed" : loadingLabel}
        </p>
      </div>

      {/* Cycling hint */}
      <div style={{ minHeight: 18, textAlign: "center", maxWidth: 280 }}>
        <p
          className="font-mono text-[11px] text-muted-foreground/80 text-center leading-relaxed"
          style={{
            opacity: hintVisible && !allReady && !hasError ? 1 : 0,
            transition: "opacity 400ms ease",
          }}
        >
          {HINTS[hintIndex]}
        </p>
      </div>

      <style>{`
        @keyframes ts-chase {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -${CIRCUMF.toFixed(1)}; }
        }
        @keyframes ts-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Animated stage renderer ──────────────────────────────────────────────────

function AnimatedStageRenderer({ ts }: { ts: UseTurtleshellReturn }) {
  const [displayedStage, setDisplayedStage] = useState<WorkflowStage>(ts.currentStage);
  const [transitioning, setTransitioning]   = useState(false);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ts.currentStage === displayedStage) return;
    setPhase("out");
    setTransitioning(true);
    timeoutRef.current = setTimeout(() => {
      setDisplayedStage(ts.currentStage);
      setPhase("in");
      timeoutRef.current = setTimeout(() => {
        setPhase("idle");
        setTransitioning(false);
      }, 350);
    }, 150);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [ts.currentStage]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = {
    opacity: phase === "out" ? 0 : 1,
    transition:
      phase === "out"
        ? "opacity 150ms cubic-bezier(0.4, 0, 1, 1)"
        : "opacity 350ms cubic-bezier(0, 0, 0.2, 1)",
    pointerEvents: transitioning ? "none" : "auto",
    willChange: "opacity",
  } as React.CSSProperties;

  return (
    <div style={style}>
      <StageRenderer ts={{ ...ts, currentStage: displayedStage }} />
    </div>
  );
}

function StageRenderer({ ts }: { ts: UseTurtleshellReturn }) {
  switch (ts.currentStage) {
    case "config":
      return (
        <ModelConfigStage
          config={ts.modelConfig}
          onUpdateConfig={ts.setModelConfig}
          onNext={() => ts.goToStage("ingestion")}
          onReadSnapshot={ts.handleReadSnapshot}
        />
      );
    case "ingestion":
      return (
        <DatasetIngestion
          files={ts.files}
          onUpload={ts.handleUpload}
          onAssignRole={ts.handleAssignRole}
          onRemoveFile={ts.handleRemoveFile}
          onBack={() => ts.goToStage("config")}
          onStartTraining={ts.handleStartTraining}
          isUploading={ts.isUploading}
          pyodideReady={ts.pyodideReady}
          delimiter={ts.modelConfig.delimiter}
        />
      );
    case "training":
      return (
        <TrainingProgressStage
          steps={ts.trainingSteps}
          currentIteration={ts.currentIteration}
          isComplete={ts.isTrainingComplete}
          onContinue={() => ts.goToStage("results")}
        />
      );
    case "annotation":
      return (
        <AnnotationWorkspaceStage
          words={ts.annotationWords}
          onUpdateBoundaries={ts.handleUpdateBoundaries}
          onBulkUpdateBoundaries={ts.handleBulkUpdateBoundaries}
          onSubmit={ts.handleSubmitAnnotations}
          onSkip={ts.handleSkipAnnotation}
          totalWords={ts.totalAnnotationWords}
          currentIteration={ts.currentIteration}
          onSnapshot={ts.handleDownloadSnapshot}
        />
      );
    case "results":
      return (
        <ResultsExportStage
          result={ts.trainingResult}
          previousResult={ts.previousResult}
          cycleHistory={ts.cycleHistory}
          queryStrategy={ts.modelConfig.queryStrategy}
          onDownloadIncrement={ts.handleDownloadIncrement}
          onDownloadResidual={ts.handleDownloadResidual}
          onDownloadEvaluation={ts.handleDownloadEvaluation}
          onAnnotate={() => ts.goToStage("annotation")}
          onNewCycle={ts.handleNewCycle}
          onStartOver={ts.handleStartOver}
          isRunningInference={ts.isRunningInference}
          inferenceComplete={ts.inferenceComplete}
          inferenceStats={ts.inferenceStats}
          onRunInference={ts.handleRunInference}
          onDownloadPredictions={ts.handleDownloadPredictions}
        />
      );
  }
}

function ErrorBanner({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="px-6 py-3 bg-red-400/10 border-b border-red-400/20">
      <p className="font-mono text-[11px] text-red-400 font-medium">{message}</p>
      {hint && <p className="font-mono text-[10px] text-red-400/60 mt-0.5">{hint}</p>}
    </div>
  );
}