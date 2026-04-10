import { useRef, useEffect, useState } from "react";

interface Props {
  view: "home" | "app" | "about";
  onNavigate: (view: "home" | "app" | "about") => void;
}

export function Navbar({ view, onNavigate }: Props) {
  const homeRef = useRef<HTMLButtonElement>(null);
  const appRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const [dotStyle, setDotStyle] = useState({ left: 0, width: 0, opacity: 0 });

  useEffect(() => {
    const active = 
      view === "home" ? homeRef.current : 
      view === "app" ? appRef.current : 
      aboutRef.current;
    if (!active) return;
    setDotStyle({
      left: active.offsetLeft,
      width: active.offsetWidth,
      opacity: 1,
    });
  }, [view]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <nav className="relative mx-auto flex h-14 max-w-7xl items-center px-8 lg:px-20">
        {/* Logo */}
        <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-2 group"
            >
            <img
                src="/u2u_morphseg/favicon.ico"
                alt="turtleshell"
                className="w-6 h-6 group-hover:opacity-80 transition-opacity duration-300"
            />
            <span className="text-[18px] font-semibold text-foreground/90 tracking-tight">
                Turtleshell
            </span>
            </button>

        {/* Nav links */}
        <div className="relative flex items-center ml-auto">
          <button
            ref={homeRef}
            onClick={() => onNavigate("home")}
            className={`px-4 py-2 text-[13px] font-medium transition-colors duration-300 ${
              view === "home" ? "text-foreground" : "text-foreground/35 hover:text-foreground/60"
            }`}
          >
            Home
          </button>
          <button
            ref={appRef}
            onClick={() => onNavigate("app")}
            className={`px-4 py-2 text-[13px] font-medium transition-colors duration-300 ${
              view === "app" ? "text-foreground" : "text-foreground/35 hover:text-foreground/60"
            }`}
          >
            App
          </button>
          <button
            ref={aboutRef}
            onClick={() => onNavigate("about")}
            className={`px-4 py-2 text-[13px] font-medium transition-colors duration-300 ${
              view === "about" ? "text-foreground" : "text-foreground/35 hover:text-foreground/60"
            }`}
          >
            About
          </button>

          {/* Sliding dot indicator */}
          <div
            className="absolute -bottom-[1px] h-px bg-primary/70 transition-all duration-300 ease-out"
            style={{
              left: dotStyle.left,
              width: dotStyle.width,
              opacity: dotStyle.opacity,
            }}
          />
        </div>
      </nav>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-foreground/5" />
    </header>
  );
}