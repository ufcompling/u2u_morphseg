// Main application shell for TurtleShell active learning workflow.

import { useState, useEffect, useRef } from "react";
import { useTurtleshell, type UseTurtleshellReturn } from "../../hooks/useTurtleShell";
import { TurtleLogo, TurtleShellBackground, StepIndicator } from "../../components/layout";
import { StatusIndicator } from "../../components/ui";
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
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative">
      <TurtleShellBackground />

      <main className="w-full max-w-4xl relative z-10">
        <div className="bg-card/98 backdrop-blur-3xl border border-border/20 rounded-2xl shadow-2xl shadow-black/40 overflow-visible ring-1 ring-white/5">
          {/* Header */}
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
            <div className="flex items-center gap-3">
              <StatusIndicator label="py" isReady={ts.pyodideReady} />
              <StatusIndicator label="db" isReady={ts.indexedDBReady} />
            </div>
          </header>

          {/* Error banners */}
          {ts.pyodideError && (
            <ErrorBanner
              message={`Pyodide failed to load: ${ts.pyodideError}`}
              hint="Check your connection — Pyodide downloads ~10MB on first run. Private browsing may block required storage."
            />
          )}
          {!ts.indexedDBReady && !ts.pyodideLoading && (
            <ErrorBanner
              message="IndexedDB unavailable"
              hint="Your browser may be blocking storage. Try disabling private/incognito mode, or check site permissions."
            />
          )}

          {/* Step Indicator */}
          <div className="border-b border-border/20">
            <StepIndicator
              currentStage={ts.currentStage}
              completedStages={ts.completedStages}
            />
          </div>

          {/* Stage Content — animated */}
          <AnimatedStageRenderer ts={ts} />
        </div>

        <p className="mt-5 text-center font-mono text-[9px] text-muted-foreground/30 tracking-wider">
          pyodide + indexeddb
        </p>
      </main>
    </div>
  );
}

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
          totalIterations={ts.totalIterations}
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
          totalIterations={ts.totalIterations}
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