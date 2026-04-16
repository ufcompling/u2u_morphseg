// App.tsx
import { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/layout/navbar";
import { LandingPage } from "./pages/LandingPage";
import { MorphAnalyzerPage } from "./pages/MorphAnalyzerPage";
import { AboutPage } from "./pages/AboutPage";

type View = "home" | "app" | "about";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [appMounted, setAppMounted] = useState(false);
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateTo = (next: View) => {
    if (next === view) return;
    // Mount the app on first visit so Pyodide starts loading
    if (next === "app") setAppMounted(true);
    setFading(true);
    timeoutRef.current = setTimeout(() => {
      setView(next);
      setFading(false);
    }, 200);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <>
      <Navbar view={view} onNavigate={navigateTo} />

      {/* Landing — unmounts once app is visited, no need to keep it */}
      <div
        style={{
          opacity: fading || view !== "home" ? 0 : 1,
          pointerEvents: view !== "home" ? "none" : "auto",
          position: view !== "home" ? "absolute" : "relative",
          transition: "opacity 200ms ease",
        }}
      >
        <LandingPage onEnter={() => navigateTo("app")} />
      </div>

      {/* App — stays mounted once visited so Pyodide/language state survives nav */}
      {appMounted && (
        <div
          style={{
            opacity: fading || view !== "app" ? 0 : 1,
            pointerEvents: view !== "app" ? "none" : "auto",
            position: view !== "app" ? "absolute" : "relative",
            transition: "opacity 200ms ease",
          }}
        >
          <MorphAnalyzerPage onBack={() => navigateTo("home")} />
        </div>
      )}

      {/* About */}
      <div
        style={{
          opacity: fading || view !== "about" ? 0 : 1,
          pointerEvents: view !== "about" ? "none" : "auto",
          position: view !== "about" ? "absolute" : "relative",
          transition: "opacity 200ms ease",
        }}
      >
        <AboutPage />
      </div>
    </>
  );
}
