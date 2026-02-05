interface StatusIndicatorProps {
  label: string;
  isReady: boolean;
}

export function StatusIndicator({ label, isReady }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/10">
      <div
        className={`w-2 h-2 rounded-full ${
          isReady ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      />
      <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wide">
        {label}
      </span>
    </div>
  );
}
