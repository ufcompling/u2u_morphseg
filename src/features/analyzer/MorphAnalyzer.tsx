// Main application shell for TurtleShell active learning workflow.

import { useState, useEffect, useRef } from "react";
import { useTurtleshell, type UseTurtleshellReturn } from "../../hooks/useTurtleShell";
import { TurtleLogo, TurtleShellBackground, StepIndicator } from "../../components/layout";
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

  // Stay on the init screen until both systems are ready, then hold for a
  // brief moment so the user can see the "ready" state before it disappears.
  const [initializing, setInitializing] = useState(true);
  const [readyToTransition, setReadyToTransition] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ts.pyodideReady && ts.indexedDBReady && initializing) {
      // Show the "all ready" state for 600ms before sliding into the app
      setReadyToTransition(true);
      transitionTimer.current = setTimeout(() => setInitializing(false), 700);
    }
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [ts.pyodideReady, ts.indexedDBReady, initializing]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative">
      <TurtleShellBackground />

      <main className="w-full max-w-4xl relative z-10">
        <div className="bg-card/98 backdrop-blur-3xl border border-border/20 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5">

          {/* Header — no status dots, they live in the init screen now */}
          <header className="px-6 py-4 flex items-center justify-between border-b border-border/20 bg-secondary/5">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center">
                <TurtleLogo className="w-6 h-6 text-primary" />
              </div>
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
            </div>
          </header>

          {initializing ? (
            <InitView
              pyodideReady={ts.pyodideReady}
              indexedDBReady={ts.indexedDBReady}
              pyodideError={ts.pyodideError}
              allReady={readyToTransition}
            />
          ) : (
            <>
              {/* Error banners — only shown post-init */}
              {ts.pyodideError && (
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
            </>
          )}
        </div>

        <p className="mt-5 text-center font-mono text-[9px] text-muted-foreground/30 tracking-wider">
          pyodide + indexeddb
        </p>
      </main>
    </div>
  );
}

// ── Initialization screen ────────────────────────────────────────────────────

interface InitViewProps {
  pyodideReady: boolean;
  indexedDBReady: boolean;
  pyodideError: string | null;
  allReady: boolean;
}

function InitView({ pyodideReady, indexedDBReady, pyodideError, allReady }: InitViewProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-8 py-16 gap-10 transition-opacity duration-500"
      style={{ opacity: allReady ? 0 : 1 }}
    >
      {/* Animated logo */}
      <div className="relative flex items-center justify-center">
        {/* Outer ring — spins until both ready */}
        <div
          className={`absolute w-20 h-20 rounded-full border-2 border-t-primary border-r-primary/30 border-b-primary/10 border-l-primary/30 transition-all duration-700 ${
            allReady ? "border-primary/40 animate-none scale-110" : "animate-spin"
          }`}
          style={{ animationDuration: "2s" }}
        />
        {/* Inner pulsing circle */}
        <div
          className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center transition-all duration-500 ${
            allReady ? "scale-110 border-primary/40 from-primary/30" : "animate-pulse"
          }`}
        >
          <TurtleLogo
            className={`w-7 h-7 transition-colors duration-500 ${
              allReady ? "text-primary" : "text-primary/60"
            }`}
          />
        </div>
      </div>

      {/* Status items */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <InitItem
          label="Python Runtime"
          sublabel="Loading Pyodide + CRF library"
          isReady={pyodideReady}
          hasError={!!pyodideError}
          errorMessage={pyodideError ?? undefined}
        />
        <InitItem
          label="Database"
          sublabel="Opening IndexedDB storage"
          isReady={indexedDBReady}
          hasError={false}
        />
      </div>

      {/* Status text */}
      <p
        className={`font-mono text-[11px] tracking-wider transition-colors duration-500 ${
          allReady
            ? "text-primary/70"
            : pyodideError
              ? "text-red-400/70"
              : "text-muted-foreground/40"
        }`}
      >
        {pyodideError
          ? "Failed to initialize — see error above"
          : allReady
            ? "Ready"
            : "Initializing…"}
      </p>
    </div>
  );
}

function InitItem({
  label,
  sublabel,
  isReady,
  hasError,
  errorMessage,
}: {
  label: string;
  sublabel: string;
  isReady: boolean;
  hasError: boolean;
  errorMessage?: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-500 ${
        hasError
          ? "border-red-400/20 bg-red-400/5"
          : isReady
            ? "border-primary/20 bg-primary/5"
            : "border-border/10 bg-secondary/5"
      }`}
    >
      {/* State icon */}
      <div className="shrink-0 w-7 h-7 flex items-center justify-center">
        {hasError ? (
          <div className="w-5 h-5 rounded-full bg-red-400/15 flex items-center justify-center">
            <span className="font-mono text-[10px] text-red-400 leading-none">✕</span>
          </div>
        ) : isReady ? (
          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
            {/* Checkmark svg inline — no extra icon import needed */}
            <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <svg
            className="w-5 h-5 text-muted-foreground/30 animate-spin"
            style={{ animationDuration: "1.2s" }}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path
              className="opacity-70"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-mono text-[12px] font-medium transition-colors duration-500 ${
            hasError
              ? "text-red-400"
              : isReady
                ? "text-primary"
                : "text-foreground/60"
          }`}
        >
          {label}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground/40 mt-0.5 truncate">
          {hasError && errorMessage ? errorMessage : sublabel}
        </p>
      </div>

      {/* Ready / loading pill */}
      <div
        className={`shrink-0 px-2 py-0.5 rounded-md font-mono text-[9px] uppercase tracking-wider transition-all duration-500 ${
          hasError
            ? "bg-red-400/10 text-red-400/70"
            : isReady
              ? "bg-primary/10 text-primary/70"
              : "bg-border/10 text-muted-foreground/30"
        }`}
      >
        {hasError ? "error" : isReady ? "ready" : "loading"}
      </div>
    </div>
  );
}

// ── Animated stage renderer ──────────────────────────────────────────────────

function AnimatedStageRenderer({ ts }: { ts: UseTurtleshellReturn }) {
  const [displayedStage, setDisplayedStage] = useState<WorkflowStage>(ts.currentStage);
  const [transitioning, setTransitioning] = useState(false);
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
    transform:
      phase === "out"  ? "translateY(3px)"
      : phase === "in" ? "translateY(-2px)"
      : "translateY(0)",
    transition:
      phase === "out"
        ? "opacity 150ms cubic-bezier(0.4, 0, 1, 1), transform 150ms cubic-bezier(0.4, 0, 1, 1)"
        : "opacity 350ms cubic-bezier(0, 0, 0.2, 1), transform 350ms cubic-bezier(0, 0, 0.2, 1)",
    pointerEvents: transitioning ? "none" : "auto",
    willChange: "opacity, transform",
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
          onSnapshot={ts.handleDownloadSnapshot}
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
          onSnapshot={ts.handleDownloadSnapshot}
        />
      );
    case "training":
      return (
        <TrainingProgressStage
          steps={ts.trainingSteps}
          currentIteration={ts.currentIteration}
          isComplete={ts.isTrainingComplete}
          onContinue={() => ts.goToStage("results")}
          onSnapshot={ts.handleDownloadSnapshot}
        />
      );
    case "annotation":
      return (
        <AnnotationWorkspaceStage
          words={ts.annotationWords}
          onUpdateBoundaries={ts.handleUpdateBoundaries}
          onSubmit={ts.handleSubmitAnnotations}
          onSkip={ts.handleSkipAnnotation}
          totalWords={ts.totalAnnotationWords}
          currentIteration={ts.currentIteration}
          onSnapshot={ts.handleDownloadSnapshot}
          onReadSnapshot={ts.handleReadSnapshot}
        />
      );
    case "results":
      return (
        <ResultsExportStage
          result={ts.trainingResult}
          previousResult={ts.previousResult}
          cycleHistory={ts.cycleHistory}
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