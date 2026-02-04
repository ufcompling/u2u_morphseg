interface StatusIndicatorProps {
  label: string;
  isReady: boolean;
}

export function StatusIndicator({ label, isReady }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-1.5 h-1.5 rounded-full transition-colors ${
          isReady ? "bg-primary" : "bg-muted-foreground/40"
        }`}
      />
      <span className="font-mono text-[9px] text-muted-foreground/70 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}