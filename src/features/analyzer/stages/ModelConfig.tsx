// Extend Window interface to include 'language' property
declare global {
  interface Window {
    language?: string;
  }
}
import type { ModelConfig, QueryStrategy } from "../../../lib/types";
import { ArrowIcon, Tooltip, UploadSmallIcon, DiceIcon } from "../../../components/ui";
import { useEffect, useRef, useState } from "react";

// ============================================================
// Model Configuration Stage
// Set active learning parameters before training
// ============================================================

interface ModelConfigProps {
  config: ModelConfig;
  onUpdateConfig: (config: ModelConfig) => void;
  onNext: () => void;
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
  onReadSnapshot,
}: ModelConfigProps) {
  const snapshotInputRef = useRef<HTMLInputElement>(null);

  // Decoupled local state for delimiter — avoids the "backspace resets to !"
  // bug that happens when config state forces non-empty on every keystroke.
  const [delimInput, setDelimInput] = useState(config.delimiter ?? "!");
  const [delimWarning, setDelimWarning] = useState(false);
  const [langInput, setLangInput] = useState(config.targetLanguage ?? "");
  useEffect(() => { setLangInput(config.targetLanguage ?? ""); }, [config.targetLanguage]);

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

  const handleDelimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length > 1) return;
    setDelimInput(val);
    setDelimWarning(false);
    if (val.length === 1) updateField("delimiter", val);
  };

  const handleDelimPreset = (char: string) => {
    setDelimInput(char);
    setDelimWarning(false);
    updateField("delimiter", char);
  };

  const handleSnapshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onReadSnapshot(reader.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleNext = () => {
    if (!delimInput.trim()) { setDelimWarning(true); return; }
    setDelimWarning(false);
    // Flush language if the user never blurred the field
    const lang = langInput.trim();
    if (lang && lang !== config.targetLanguage) {
      updateField("targetLanguage", lang);
    }
    onNext();
  };

  const activeStrategy = STRATEGY_INFO[config.queryStrategy];
  const canStart = langInput.trim().length > 0;
  const isRandom = config.randomSeed === null;
  const isCustomDelim = !DELIMITER_PRESETS.some((d) => d === delimInput);

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
            value={langInput}
            onChange={(e) => setLangInput(e.target.value)}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) updateField("targetLanguage", val);
            }}
            placeholder="e.g. Swahili, Turkish, Zulu..."
            className="w-full bg-card border border-border/20 rounded-lg px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
        </fieldset>
      </div>

      {/* Config form */}
      <div className="px-6 py-6 flex flex-col gap-7 border-b border-border/20">

        {/* 1. Annotated File Delimiter — full width */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Annotated File Delimiter
            </label>
            <Tooltip text="The character used to separate morphemes in your annotated training file. Must match exactly what your file uses." />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
            {/* Left: presets + custom input */}
            <div className="flex flex-col gap-2">
              {/* Preset chips */}
              <div className="flex gap-1.5">
                {DELIMITER_PRESETS.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDelimPreset(d)}
                    className={`w-9 h-9 rounded-lg font-mono text-[15px] font-medium transition-all ${
                      delimInput === d
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background border border-border/20 text-muted-foreground/60 hover:text-foreground hover:border-primary/30 hover:bg-primary/5"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Custom input — controlled directly by delimInput, not config.delimiter */}
              <div className={`flex items-center gap-2.5 px-3 py-2 bg-card border rounded-lg transition-colors ${
                delimWarning
                  ? "border-red-400/50"
                  : isCustomDelim && delimInput
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-border/20"
              }`}>
                <span className="font-mono text-[10px] text-muted-foreground/30 uppercase tracking-wider shrink-0">
                  custom
                </span>
                <input
                  type="text"
                  value={delimInput}
                  onChange={handleDelimChange}
                  maxLength={1}
                  placeholder="any character"
                  className="flex-1 bg-transparent font-mono text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/20"
                />
                {delimWarning && (
                  <span className="font-mono text-[10px] text-red-400 shrink-0">required</span>
                )}
              </div>
            </div>

            {/* Right: chip preview panel */}
            <div className="flex flex-col px-3.5 py-3 bg-secondary/5 border border-border/10 rounded-lg w-[140px]">
              <p className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2.5">
                preview
              </p>
              {delimInput ? (
                <>
                  <p className="font-mono text-[12px] text-muted-foreground/50 mb-2.5 tracking-wide">
                    un<span className="text-primary font-bold">{delimInput}</span>
                    hap<span className="text-primary font-bold">{delimInput}</span>py
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {["un", "hap", "py"].map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/15 font-mono text-[10px] text-primary/80"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="font-mono text-[10px] text-muted-foreground/25 italic">no delimiter set</p>
              )}
            </div>
          </div>

          <p className="font-mono text-[11px] text-muted-foreground/70">
            Monomorphemic words without the delimiter are valid
          </p>
        </div>

        {/* 2. Increment Size + Seed — side by side */}
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
                  <span className="font-mono text-[10px] text-muted-foreground/50">
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
                className="p-2.5 rounded-lg border border-border/20 bg-card text-muted-foreground/70 hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                title="Roll a random seed and lock it"
              >
                <DiceIcon className="w-4 h-4" />
              </button>
              {!isRandom && (
                <button
                  onClick={() => updateField("randomSeed", null)}
                  className="p-2.5 rounded-lg border border-border/20 bg-card text-muted-foreground/70 hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all"
                  title="Clear seed — use random each cycle"
                >
                  <span className="font-mono text-xs leading-none">✕</span>
                </button>
              )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground/70">
              {isRandom ? "Click 🎲 to lock a specific seed" : `Locked · 0 – ${SEED_MAX.toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* 3. Query Strategy — full width */}
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
          onClick={handleNext}
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
        </div>
      </footer>
    </div>
  );
}