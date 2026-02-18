// Main application shell for TurtleShell active learning workflow.
 

"use client";

import { useTurtleshell } from "../hooks/useTurtleShell";
import { TurtleLogo } from "../components/turtle-logo";
import { StatusIndicator } from "./ui/status-indicator";
import { StepIndicator } from "../components/step-indicator";
import { TurtleShellBackground } from "../components/turtle-background";
import { DatasetIngestion } from "../components/stages/dataset-ingestion";
import { ModelConfigStage } from "../components/stages/model-config";
import { TrainingProgressStage } from "../components/stages/training-progress";
import { AnnotationWorkspaceStage } from "../components/stages/annotation-workspace";
import { ResultsExportStage } from "../components/stages/results-export";

export function TurtleshellApp() {
  const ts = useTurtleshell();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative">
      <TurtleShellBackground />

      <main className="w-full max-w-4xl relative z-10">
        <div className="bg-card/98 backdrop-blur-3xl border border-border/20 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5">
          {/* Inline Header */}
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

          {/* Step Indicator */}
          <div className="border-b border-border/20">
            <StepIndicator
              currentStage={ts.currentStage}
              completedStages={ts.completedStages}
            />
          </div>

          {/* Stage Content */}
          <StageRenderer ts={ts} />
        </div>

        {/* Footer branding */}
        <p className="mt-5 text-center font-mono text-[9px] text-muted-foreground/30 tracking-wider">
          pyodide + indexeddb
        </p>
      </main>
    </div>
  );
}

function StageRenderer({ ts }: { ts: ReturnType<typeof useTurtleshell> }) {
  switch (ts.currentStage) {
    case "ingestion":
      return (
        <DatasetIngestion
          files={ts.files}
          onUpload={ts.handleUpload}
          onAssignRole={ts.handleAssignRole}
          onRemoveFile={ts.handleRemoveFile}
          onNext={() => ts.goToStage("config")}
          isUploading={ts.isUploading}
        />
      );

    case "config":
      return (
        <ModelConfigStage
          config={ts.modelConfig}
          onUpdateConfig={ts.setModelConfig}
          onBack={() => ts.goToStage("ingestion")}
          onStartTraining={ts.handleStartTraining}
        />
      );

    case "training":
      return (
        <TrainingProgressStage
          steps={ts.trainingSteps}
          currentIteration={ts.currentIteration}
          totalIterations={ts.totalIterations}
          isComplete={ts.isTrainingComplete}
          onContinue={() => ts.goToStage("annotation")}
        />
      );

    case "annotation":
      return (
        <AnnotationWorkspaceStage
          words={ts.annotationWords}
          onUpdateBoundaries={ts.handleUpdateBoundaries}
          onSubmit={ts.handleSubmitAnnotations}
          onSkip={ts.handleSkipAnnotation}
          currentWordIndex={ts.currentWordIndex}
          totalWords={ts.totalAnnotationWords}
          currentIteration={ts.currentIteration}
          totalIterations={ts.totalIterations}
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