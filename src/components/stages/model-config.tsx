"use client";

import type { ModelConfig, QueryStrategy } from "../../lib/types";

// ============================================================
// Model Configuration Stage
// Set active learning parameters before training
// ============================================================

interface ModelConfigProps {
  config: ModelConfig;
  onUpdateConfig: (config: ModelConfig) => void;
  onBack: () => void;
  onStartTraining: () => void;
}

// Strategy descriptions for tooltips
const STRATEGY_INFO: Record<QueryStrategy, { label: string; description: string }> = {
  uncertainty: {
    label: "Uncertainty Sampling",
    description:
      "Selects samples where the model is least confident about its prediction. Best for rapidly improving weak areas.",
  },
  margin: {
    label: "Margin Sampling",
    description:
      "Selects samples where the gap between the top two predictions is smallest. Good for resolving ambiguous cases.",
  },
  random: {
    label: "Random Sampling",
    description:
      "Selects samples at random. Useful as a baseline to compare against active strategies.",
  },
};

export function ModelConfigStage({
  config,
  onUpdateConfig,
  onBack,
  onStartTraining,
}: ModelConfigProps) {
  const updateField = <K extends keyof ModelConfig>(
    key: K,
    value: ModelConfig[K]
  ) => {
    onUpdateConfig({ ...config, [key]: value });
  };

  const activeStrategy = STRATEGY_INFO[config.queryStrategy];

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/20">
        <h2 className="font-mono text-sm font-semibold text-foreground">
          Configure Active Learning
        </h2>
        <p className="font-mono text-[11px] text-muted-foreground/50 mt-1">
          These parameters control how the model selects data for annotation
        </p>
      </div>

      {/* Config form */}
      <div className="px-6 py-6 flex flex-col gap-7 border-b border-border/20">
        {/* Two-column row for increment + iterations */}
        <div className="grid grid-cols-2 gap-5">
          {/* Increment size */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[11px] text-muted-foreground/70 uppercase tracking-wider">
                Increment Size
              </label>
              <Tooltip text="How many new samples the model requests for human annotation each cycle. Smaller values mean more frequent but lighter annotation rounds." />
            </div>
            <input
              type="number"
              value={config.incrementSize}
              onChange={(e) =>
                updateField(
                  "incrementSize",
                  Math.max(1, Number(e.target.value))
                )
              }
              min={1}
              className="w-full bg-[#3a5a40] border border-border/20 rounded-lg px-4 py-3 font-mono text-sm text-[#dad7cd] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
            />
            <p className="font-mono text-[10px] text-muted-foreground/30">
              Words queried each round
            </p>
          </div>

          {/* Iterations */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[11px] text-muted-foreground/70 uppercase tracking-wider">
                Iterations
              </label>
              <Tooltip text="Total number of annotation cycles. After each cycle the model retrains and selects new uncertain samples." />
            </div>
            <input
              type="number"
              value={config.iterations}
              onChange={(e) =>
                updateField("iterations", Math.max(1, Number(e.target.value)))
              }
              min={1}
              className="w-full bg-[#3a5a40] border border-border/20 rounded-lg px-4 py-3 font-mono text-sm text-[#dad7cd] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
            />
            <p className="font-mono text-[10px] text-muted-foreground/30">
              Train-annotate-retrain rounds
            </p>
          </div>
        </div>

        {/* Query strategy - full width with description */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <label className="font-mono text-[11px] text-muted-foreground/70 uppercase tracking-wider">
              Query Strategy
            </label>
            <Tooltip text="The algorithm used to decide which unlabeled samples are most valuable for the human to annotate next." />
          </div>

          {/* Strategy selector as segmented control */}
          <div className="flex gap-1 p-1 bg-[#344e41] border border-border/15 rounded-lg">
            {(Object.keys(STRATEGY_INFO) as QueryStrategy[]).map(
              (strategy) => (
                <button
                  key={strategy}
                  onClick={() => updateField("queryStrategy", strategy)}
                  className={`flex-1 px-3 py-2.5 rounded-md font-mono text-[11px] transition-all ${
                    config.queryStrategy === strategy
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary/10"
                  }`}
                >
                  {STRATEGY_INFO[strategy].label.split(" ")[0]}
                </button>
              )
            )}
          </div>

          {/* Active strategy description */}
          <div className="px-3 py-2.5 bg-secondary/5 border border-border/10 rounded-lg">
            <p className="font-mono text-[11px] text-foreground/80 font-medium">
              {activeStrategy.label}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground/40 mt-1 leading-relaxed">
              {activeStrategy.description}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-all"
        >
          Back
        </button>
        <button
          onClick={onStartTraining}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-mono text-xs font-semibold tracking-wide transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          <span>Start Training</span>
          <ArrowIcon />
        </button>
      </footer>
    </div>
  );
}

// ---- Small helper components ----

function Tooltip({ text }: { text: string }) {
  return (
    <div className="relative group/tip">
      <div className="w-4 h-4 rounded-full bg-secondary/15 border border-border/10 flex items-center justify-center cursor-help">
        <span className="font-mono text-[9px] text-muted-foreground/40 font-bold">
          ?
        </span>
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity duration-150 z-20">
        <div className="bg-card border border-border/30 rounded-lg px-3 py-2 shadow-xl shadow-black/30 w-56">
          <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
