export function TurtleShellBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-background overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-secondary/20" />
      {/* Soft vignette */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-transparent to-background/60" />
    </div>
  );
}
