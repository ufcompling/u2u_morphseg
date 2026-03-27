import { TurtleShellBackground } from "../components/layout";
import { MorphAnalyzer } from "../features/analyzer/MorphAnalyzer";

interface Props {
  onBack: () => void;
}

export function MorphAnalyzerPage({ onBack: _onBack }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative">
      <TurtleShellBackground />
      <MorphAnalyzer />
    </div>
  );
}