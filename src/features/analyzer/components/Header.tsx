/* =============================================================================
 * HEADER - Logo, Title, Status Indicators
 * ============================================================================= */

import { TurtleLogo } from "../../../components/ui/turtle-logo";
// import { StatusIndicator } from "../components/ui/status-indicator";

interface HeaderProps {
  pyodideReady: boolean;
  indexedDBReady: boolean;
  fileCount: number;
}

export function Header({ pyodideReady, indexedDBReady, fileCount }: HeaderProps) {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-border/20 bg-secondary/5">
      <div className="flex items-center gap-4">
        {/* Logo container with subtle gradient */}
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center">
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
            {fileCount} {fileCount === 1 ? "file" : "files"} stored
          </p>
        </div>
      </div>

      {/* Status indicators - show when Pyodide and IndexedDB are ready */}
      <div className="flex items-center gap-3">
        <StatusIndicator label="py" isReady={pyodideReady} />
        <StatusIndicator label="db" isReady={indexedDBReady} />
      </div>
    </header>
  );
}

// Small status dot that pulses red when not ready, turns green when ready
function StatusIndicator({ label, isReady }: { label: string; isReady: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      <span className="font-mono text-[9px] text-muted-foreground/40 uppercase">{label}</span>
    </div>
  );
}
