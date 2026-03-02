/**
 * tooltip.tsx
 * Location: src/components/ui/tooltip.tsx
 *
 * Purpose:
 *   Lightweight hover tooltip. Shows a "?" trigger that reveals
 *   explanatory text on hover. Used across config and results stages.
 */

export function Tooltip({ text }: { text: string }) {
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