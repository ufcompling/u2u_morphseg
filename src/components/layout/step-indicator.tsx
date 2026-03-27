import { WORKFLOW_STAGES, type WorkflowStage } from "../../lib/types";
import { CheckIcon } from "../ui";

interface StepIndicatorProps {
  currentStage: WorkflowStage;
  completedStages: WorkflowStage[];
}

export function StepIndicator({ currentStage, completedStages }: StepIndicatorProps) {
  const currentIndex = WORKFLOW_STAGES.findIndex((s) => s.id === currentStage);

  return (
    <nav className="flex items-center justify-between px-6 py-5" aria-label="Workflow progress">
      {WORKFLOW_STAGES.map((stage, index) => {
        const isCompleted = completedStages.includes(stage.id);
        const isCurrent = stage.id === currentStage;
        const isPast = index < currentIndex;

        return (
          <div key={stage.id} className="flex items-center flex-1 last:flex-none">
            {/* Step dot + label */}
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-semibold transition-all ${
                  isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/40 ring-offset-2 ring-offset-card"
                    : isCompleted || isPast
                      ? "bg-primary/40 text-primary"
                      : "bg-secondary/40 text-foreground/50"
                }`}
              >
                {isCompleted || isPast ? (
                  <CheckIcon className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`font-mono text-[11px] tracking-wide transition-colors hidden sm:block ${
                  isCurrent
                    ? "text-foreground font-semibold"
                    : isCompleted || isPast
                      ? "text-primary/80"
                      : "text-foreground/50"
                }`}
              >
                {stage.shortLabel}
              </span>
            </div>

            {/* Connector line */}
            {index < WORKFLOW_STAGES.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 transition-colors ${
                  isPast || isCompleted ? "bg-primary/50" : "bg-border/40"
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}