import { useEffect } from "react";
import type { TrainingStep } from "../../../lib/types";
import { ArrowIcon, CheckIcon } from "../../../components/ui/icons";

interface TrainingProgressProps {
  steps: TrainingStep[];
  currentIteration: number;
  isComplete: boolean;
  onContinue: () => void;
}

export function TrainingProgressStage({
  steps,
  currentIteration,
  isComplete,
  onContinue,
}: TrainingProgressProps) {
  const completedCount = steps.filter((s) => s.status === "complete").length;
  const activeIndex = steps.findIndex((s) => s.status === "active");

  const progressUnits = isComplete
    ? steps.length
    : activeIndex !== -1
      ? activeIndex + 0.5
      : completedCount;
  const pct = steps.length > 0 ? (progressUnits / steps.length) * 100 : 0;

  useEffect(() => {
    console.debug("TrainingProgress props:", {
      stepsCount: steps.length,
      completedCount,
      activeIndex,
      progressUnits,
      pct: Number(pct.toFixed(2)),
      currentIteration,
      isComplete,
    });
  }, [steps, completedCount, activeIndex, progressUnits, pct, currentIteration, isComplete]);

  return (
    <div className="flex flex-col">
      {/* ---- Header group: title + cycle + summary ---- */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">
              {isComplete ? "Training complete" : "Training in progress"}
            </h2>
            {!isComplete && (
              <p className="font-mono text-[10px] text-muted-foreground/70 mt-1">
                Usually takes under a minute
              </p>
            )}
          </div>

          {/* Cycle counter */}
          <div className="px-3 py-1.5 rounded-lg bg-secondary/20 flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider">
              Cycle
            </span>
            <span className="font-mono text-[11px] text-foreground tabular-nums font-medium">
              {currentIteration}
            </span>
          </div>
        </div>

        {/* Mini progress -- step count */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-0.5 bg-border/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full"
              style={{ width: `${pct}%`, transition: "width 600ms ease-out" }}
            />
          </div>
          <span className="font-mono text-[9px] text-muted-foreground/70 tabular-nums">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      {/* ---- Divider between header group and step group ---- */}
      <div className="mx-6 h-px bg-border/10" />

      {/* ---- Step timeline ---- */}
      <div className="px-6 py-6">
        <div className="relative">
          {/* Vertical track */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/10" />
          {/* Vertical fill */}
          <div
            className="absolute left-[15px] top-4 w-px bg-primary/40"
            style={{
              height: `${pct}%`,
              maxHeight: "calc(100% - 2rem)",
              transition: "height 600ms ease-out",
            }}
          />

          {steps.map((step, index) => {
            const isActive = step.status === "active";
            const isCompleted = step.status === "complete";
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="flex items-start gap-4 relative py-3">
                {/* Step dot */}
                <div className="relative z-10 shrink-0">
                  {isCompleted ? (
                    <div className="w-[30px] h-[30px] rounded-full bg-primary/15 flex items-center justify-center">
                      <CheckIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                  ) : isActive ? (
                    <div className="w-[30px] h-[30px] rounded-full bg-primary/10 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <div className="w-[30px] h-[30px] rounded-full bg-secondary/8 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/15" />
                    </div>
                  )}
                </div>

                {/* Step label */}
                <div className="flex-1 pt-1">
                  <p
                    className={`font-mono text-[13px] transition-colors ${
                      isActive
                        ? "text-foreground font-medium"
                        : isCompleted
                          ? "text-primary"
                          : "text-muted-foreground/70"
                    }`}
                  >
                    {step.label}
                  </p>
                  {isActive && isLast && (
                    <p className="font-mono text-[9px] text-muted-foreground/70 mt-1">
                      Final step
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Footer -- CTA anchored to final step ---- */}
      <div className="mx-6 h-px bg-border/10" />
      <footer className="px-6 py-4">
        {isComplete ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-[11px] text-muted-foreground/70">
              Ready to annotate words
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onContinue}
                className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-mono text-[11px] font-semibold tracking-wide transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary active:scale-[0.97]"
              >
                <span>Continue to Results</span>
                <ArrowIcon />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground/20">
              Waiting for training to finish
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}