import { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/layout/navbar";
import { LandingPage } from "./pages/LandingPage";
import { MorphAnalyzerPage } from "./pages/MorphAnalyzerPage";

type View = "home" | "app";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [displayedView, setDisplayedView] = useState<View>("home");
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateTo = (next: View) => {
    if (next === view) return;
    setFading(true);
    timeoutRef.current = setTimeout(() => {
      setDisplayedView(next);
      setView(next);
      setFading(false);
    }, 200);
  };

  // Cleanup on unmount
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <>
      <Navbar view={view} onNavigate={navigateTo} />
      <div
        className="transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {displayedView === "home"
          ? <LandingPage onEnter={() => navigateTo("app")} />
          : <MorphAnalyzerPage onBack={() => navigateTo("home")} />
        }
      </div>
    </>
  );
}