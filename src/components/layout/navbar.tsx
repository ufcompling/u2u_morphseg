import { TurtleLogo } from "./turtle-logo";

interface Props {
  view: "home" | "app";
  onNavigate: (view: "home" | "app") => void;
}

export function Navbar({ view, onNavigate }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="mx-auto flex h-14 max-w-7xl items-center px-8 lg:px-16">
        <button onClick={() => onNavigate("home")} className="flex items-center gap-2.5 group">
          <TurtleLogo className="w-6 h-6 text-primary group-hover:text-primary/80 transition-colors" />
          <span className="text-[15px] font-semibold text-foreground tracking-tight">TurtleShell</span>
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onNavigate("home")}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
              view === "home" ? "text-foreground bg-foreground/5" : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            Home
          </button>
          <button
            onClick={() => onNavigate("app")}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
              view === "app" ? "text-foreground bg-foreground/5" : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            App
          </button>
        </div>
      </nav>
    </header>
  );
}