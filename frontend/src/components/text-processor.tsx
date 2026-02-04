import { useTurtleshell } from "../hooks/use-turtleshell";
import { TurtleLogo } from "./turtle-logo";
import { TurtleShellBackground } from "./turtle-shell-background";
import { StatusIndicator } from "./ui/status-indicator";
import { SectionHeader } from "./ui/section-header";

export function TextProcessor() {
  const {
    inputText,
    outputText,
    isProcessing,
    isFetching,
    pyodideReady,
    indexedDBReady,
    entryCount,
    setInputText,
    handleProcess,
    handleFetch,
  } = useTurtleshell();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 relative">
      <TurtleShellBackground />

      <main className="w-full max-w-2xl relative z-10">
        <div className="bg-card/90 backdrop-blur-2xl border border-border/60 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <Header
            pyodideReady={pyodideReady}
            indexedDBReady={indexedDBReady}
          />

          {/* Input Section */}
          <InputSection
            value={inputText}
            onChange={setInputText}
          />

          {/* Output Section */}
          <OutputSection output={outputText} />

          {/* Footer */}
          <Footer
            onProcess={handleProcess}
            onFetch={handleFetch}
            isProcessing={isProcessing}
            isFetching={isFetching}
            entryCount={entryCount}
          />
        </div>

        <p className="mt-5 text-center font-mono text-[9px] text-muted-foreground/30 tracking-wider">
          pyodide + indexeddb
        </p>
      </main>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * Header Component
 * -------------------------------------------------------------------------- */

interface HeaderProps {
  pyodideReady: boolean;
  indexedDBReady: boolean;
}

function Header({ pyodideReady, indexedDBReady }: HeaderProps) {
  return (
    <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <TurtleLogo className="w-5 h-5 text-primary" />
        <h1 className="font-mono text-sm font-medium tracking-wide text-foreground">
          turtleshell
        </h1>
        <span className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-widest">
          v1.0
        </span>
      </div>

      <div className="flex items-center gap-5">
        <StatusIndicator label="py" isReady={pyodideReady} />
        <StatusIndicator label="db" isReady={indexedDBReady} />
      </div>
    </header>
  );
}

/* -----------------------------------------------------------------------------
 * Input Section Component
 * -------------------------------------------------------------------------- */

interface InputSectionProps {
  value: string;
  onChange: (value: string) => void;
}

function InputSection({ value, onChange }: InputSectionProps) {
  return (
    <section className="border-b border-border/50">
      <SectionHeader title="Input" meta={value.length} />
      <div className="px-6 py-5">
        <textarea
          placeholder="Enter text to process..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-24 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none leading-relaxed"
        />
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------------
 * Output Section Component
 * -------------------------------------------------------------------------- */

interface OutputSectionProps {
  output: string;
}

function OutputSection({ output }: OutputSectionProps) {
  return (
    <section className="border-b border-border/50">
      <SectionHeader title="Output" />
      <div className="px-6 py-5 min-h-[96px]">
        {output ? (
          <pre className="font-mono text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {output}
          </pre>
        ) : (
          <span className="font-mono text-sm text-muted-foreground/25 italic">
            Results will appear here
          </span>
        )}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------------
 * Footer Component
 * -------------------------------------------------------------------------- */

interface FooterProps {
  onProcess: () => void;
  onFetch: () => void;
  isProcessing: boolean;
  isFetching: boolean;
  entryCount: number;
}

function Footer({ onProcess, onFetch, isProcessing, isFetching, entryCount }: FooterProps) {
  return (
    <footer className="px-6 py-4 flex items-center justify-between bg-secondary/5">
      <div className="flex gap-2">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className="font-mono text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {isProcessing ? "Processing..." : "Process"}
        </button>
        <button
          onClick={onFetch}
          disabled={isFetching}
          className="font-mono text-xs px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {isFetching ? "Fetching..." : "Fetch"}
        </button>
      </div>

      <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums">
        {entryCount} entries
      </span>
    </footer>
  );
}