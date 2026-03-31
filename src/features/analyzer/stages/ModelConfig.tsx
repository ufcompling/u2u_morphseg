// Extend Window interface to include 'language' property
declare global {
  interface Window {
    language?: string;
  }
}
import type { ModelConfig, QueryStrategy } from "../../../lib/types";
import { ArrowIcon, Tooltip, SnapshotIcon, UploadSmallIcon, DiceIcon } from "../../../components/ui";
import { useEffect, useRef } from "react";

// ============================================================
// Model Configuration Stage
// Set active learning parameters before training
// ============================================================

interface ModelConfigProps {
  config: ModelConfig;
  onUpdateConfig: (config: ModelConfig) => void;
  onNext: () => void;
  onSnapshot: () => void;
  onReadSnapshot: (snapshotJson: string) => Promise<void>;
}

const SEED_MAX = 4_294_967_295;

function rollSeed(): number {
  return Math.floor(Math.random() * (SEED_MAX + 1));
}

const DELIMITER_PRESETS = ["!", "|", "+", "-", "_"] as const;

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
  onNext,
  onSnapshot,
  onReadSnapshot,
}: ModelConfigProps) {
  const snapshotInputRef = useRef<HTMLInputElement>(null);

  const handleSnapshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onReadSnapshot(reader.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => {
    if (typeof window !== "undefined" && config.targetLanguage) {
      window.language = config.targetLanguage;
    }
  }, [config.targetLanguage]);

  const updateField = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    onUpdateConfig({ ...config, [key]: value });
    if (key === "targetLanguage" && typeof window !== "undefined" && typeof value === "string") {
      window.language = value;
    }
  };

  const activeStrategy = STRATEGY_INFO[config.queryStrategy];
  const canStart = config.targetLanguage.trim().length > 0;
  const isRandom = config.randomSeed === null;
  const delim = config.delimiter || "!";

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/20">
        <h2 className="font-mono text-sm font-semibold text-foreground">
          Configure Active Learning
        </h2>
        <p className="font-mono text-[11px] text-muted-foreground/70 mt-1">
          These parameters control how the model selects data for annotation
        </p>
      </div>

      {/* Target Language */}
      <div className="px-6 pt-6 pb-5 border-b border-border/20">
        <fieldset className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <legend className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
              Target Language
            </legend>
            <Tooltip text="The language of your morphological data. This helps the model select appropriate features for segmentation." />
          </div>
          <input
            type="text"
            value={config.targetLanguage}
            onChange={(e) => updateField("targetLanguage", e.target.value)}
            placeholder="e.g. Swahili, Turkish, Zulu..."
            className="w-full bg-card border border-border/20 rounded-lg px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
        </fieldset>
      </div>

      {/* Config form */}
      <div className="px-6 py-6 flex flex-col gap-7 border-b border-border/20">

        {/* 1. Delimiter — full width, first */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Annotated File Delimiter
            </label>
            <Tooltip text="The character used to separate morphemes in your annotated training file. Must match exactly what your file uses." />
          </div>

          <div className="flex items-center gap-2">
            {/* Preset buttons */}
            <div className="flex items-center gap-1 p-1 bg-background border border-border/15 rounded-lg">
              {DELIMITER_PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => updateField("delimiter", d)}
                  className={`w-9 h-9 rounded-md font-mono text-sm font-semibold transition-all ${
                    delim === d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/10"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <input
              type="text"
              value={delim}
              maxLength={3}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= 3) updateField("delimiter", val);
              }}
              className="w-20 bg-card border border-border/20 rounded-lg px-3 py-2 font-mono text-sm text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
              placeholder="custom"
            />

            {/* Live example preview */}
            <div className="flex-1 px-3 py-2 bg-secondary/5 border border-border/10 rounded-lg">
              <span className="font-mono text-[11px] text-muted-foreground/50">example: </span>
              <span className="font-mono text-[11px] text-foreground/70">
                walk{delim}ed
              </span>
              <span className="font-mono text-[11px] text-muted-foreground/30 mx-1.5">·</span>
              <span className="font-mono text-[11px] text-foreground/70">
                un{delim}happy
              </span>
              <span className="font-mono text-[11px] text-muted-foreground/30 mx-1.5">·</span>
              <span className="font-mono text-[11px] text-foreground/70">
                mean{delim}ing{delim}less
              </span>
            </div>
          </div>

          <p className="font-mono text-[11px] text-muted-foreground/50">
            Monomorphemic words without the delimiter are valid
          </p>
        </div>

        {/* 2. Increment size + Seed — side by side */}
        <div className="grid grid-cols-2 gap-5">
          {/* Increment size */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                Increment Size
              </label>
              <Tooltip text="How many new samples the model requests for human annotation each cycle. Smaller values mean more frequent but lighter annotation rounds." />
            </div>
            <input
              type="number"
              value={config.incrementSize}
              onChange={(e) =>
                updateField("incrementSize", Math.max(1, Number(e.target.value)))
              }
              min={1}
              className="w-full bg-card border border-border/20 rounded-lg px-4 py-3 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
            />
            <p className="font-mono text-[11px] text-muted-foreground/70">
              Words queried each round
            </p>
          </div>

          {/* Seed */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                Seed
              </label>
              <Tooltip text="Controls the 80/20 train/test split of your annotated data. Leave empty for a new random split each cycle, or fix a value to reproduce exact results." />
            </div>
            <div className="flex items-center gap-1.5">
              {isRandom ? (
                <div className="flex-1 flex items-center gap-2 px-4 py-3 bg-card border border-border/15 rounded-lg">
                  <span className="font-mono text-[11px] text-muted-foreground/40 uppercase tracking-widest">
                    Random
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/25">
                    · new split each cycle
                  </span>
                </div>
              ) : (
                <input
                  type="number"
                  value={config.randomSeed!}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      updateField("randomSeed", null);
                    } else {
                      updateField(
                        "randomSeed",
                        Math.min(SEED_MAX, Math.max(0, Math.trunc(Number(raw))))
                      );
                    }
                  }}
                  min={0}
                  max={SEED_MAX}
                  step={1}
                  className="flex-1 bg-card border border-primary/30 rounded-lg px-4 py-3 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
                />
              )}
              <button
                onClick={() => updateField("randomSeed", rollSeed())}
                className="p-2.5 rounded-lg border border-border/20 bg-card text-muted-foreground/50 hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                title="Roll a random seed and lock it"
              >
                <DiceIcon className="w-4 h-4" />
              </button>
              {!isRandom && (
                <button
                  onClick={() => updateField("randomSeed", null)}
                  className="p-2.5 rounded-lg border border-border/20 bg-card text-muted-foreground/40 hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all"
                  title="Clear seed — use random each cycle"
                >
                  <span className="font-mono text-xs leading-none">✕</span>
                </button>
              )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground/50">
              {isRandom ? "Click 🎲 to lock a specific seed" : `Locked · 0 – ${SEED_MAX.toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* 3. Query strategy — full width, last */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Query Strategy
            </label>
            <Tooltip text="The algorithm used to decide which unlabeled samples are most valuable for the human to annotate next." />
          </div>
          <div className="flex gap-1 p-1 bg-background border border-border/15 rounded-lg">
            {(Object.keys(STRATEGY_INFO) as QueryStrategy[]).map((strategy) => (
              <button
                key={strategy}
                onClick={() => updateField("queryStrategy", strategy)}
                className={`flex-1 px-3 py-2.5 rounded-md font-mono text-[12px] transition-all ${
                  config.queryStrategy === strategy
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/10"
                }`}
              >
                {STRATEGY_INFO[strategy].label.split(" ")[0]}
              </button>
            ))}
          </div>
          <div className="px-3 py-2.5 bg-secondary/5 border border-border/10 rounded-lg">
            <p className="font-mono text-[12px] text-foreground font-medium">
              {activeStrategy.label}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
              {activeStrategy.description}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 flex items-center justify-between">
        <button
          onClick={onNext}
          disabled={!canStart}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-mono text-xs font-semibold tracking-wide transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
        >
          <span>Upload Files</span>
          <ArrowIcon />
        </button>
        <div className="flex items-center gap-2">
          <input
            ref={snapshotInputRef}
            type="file"
            accept=".json"
            onChange={handleSnapshotUpload}
            className="hidden"
          />
          <button
            onClick={() => snapshotInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/40 bg-secondary/10 font-mono text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all"
            title="Restore work from a snapshot file"
          >
            <UploadSmallIcon />
            <span>Restore Snapshot</span>
          </button>
          <button
            onClick={onSnapshot}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/40 bg-secondary/10 font-mono text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-all"
            title="Download a snapshot of your current work"
          >
            <SnapshotIcon />
            <span>Snapshot</span>
          </button>
        </div>
      </footer>
    </div>
  );
}