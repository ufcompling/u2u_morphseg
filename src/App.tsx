import { useState } from "react";
import { Navbar } from "./components/layout/navbar";
import { LandingPage } from "./pages/LandingPage";
import { MorphAnalyzerPage } from "./pages/MorphAnalyzerPage";

type View = "home" | "app";

export default function App() {
  const [view, setView] = useState<View>("home");

  return (
    <>
      <Navbar view={view} onNavigate={setView} />
      {view === "home"
        ? <LandingPage onEnter={() => setView("app")} />
        : <MorphAnalyzerPage onBack={() => setView("home")} />
      }
    </>
  );
}