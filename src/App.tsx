import { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/layout/navbar";
import { LandingPage } from "./pages/LandingPage";
import { MorphAnalyzerPage } from "./pages/MorphAnalyzerPage";

type View = "home" | "app";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [displayedView, setDisplayedView] = useState<View>("home");
  const [transitionState, setTransitionState] = useState<"idle" | "out" | "in">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateTo = (next: View) => {
    if (next === view || transitionState !== "idle") return;

    setTransitionState("out");
    timeoutRef.current = setTimeout(() => {
      setDisplayedView(next);
      setView(next);
      setTransitionState("in");
      timeoutRef.current = setTimeout(() => setTransitionState("idle"), 350);
    }, 250);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const isOut = transitionState === "out";
  const isIn = transitionState === "in";

  return (
    <>
      <Navbar view={view} onNavigate={navigateTo} />
      <div
        style={{
          opacity: isOut ? 0 : 1,
          transform: isOut
            ? "translateY(6px)"
            : isIn
              ? "translateY(-4px)"
              : "translateY(0)",
          transition: isOut
            ? "opacity 250ms ease-in, transform 250ms ease-in"
            : "opacity 350ms ease-out, transform 350ms ease-out",
        }}
      >
        {displayedView === "home"
          ? <LandingPage onEnter={() => navigateTo("app")} />
          : <MorphAnalyzerPage onBack={() => navigateTo("home")} />
        }
      </div>
    </>
  );
}