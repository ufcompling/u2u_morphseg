import { TurtleShellBackground } from "../components/layout";
import { MorphAnalyzer } from "../features/analyzer/MorphAnalyzer";

interface Props {
  onBack: () => void;
}

export function MorphAnalyzerPage({ onBack: _onBack }: Props) {
  return (
    <div className="relative">
      <TurtleShellBackground />
      <MorphAnalyzer />
    </div>
  );
}