interface SectionHeaderProps {
  title: string;
  meta?: string | number;
}

export function SectionHeader({ title, meta }: SectionHeaderProps) {
  return (
    <div className="px-6 py-2.5 border-b border-border/30 flex items-center justify-between bg-secondary/10">
      <span className="font-mono text-[9px] text-muted-foreground/80 uppercase tracking-widest">
        {title}
      </span>
      {meta !== undefined && (
        <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums">
          {meta}
        </span>
      )}
    </div>
  );
}