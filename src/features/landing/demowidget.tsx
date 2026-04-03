import { useState, useEffect } from "react";

const EXAMPLES = [
  { word: "turtleshell", segments: ["turtle", "shell"], lang: "English" },
  { word: "sunflower", segments: ["sun", "flower"], lang: "English" },
  { word: "wonderful", segments: ["wonder", "ful"], lang: "English" },
  { word: "thankfulness", segments: ["thank", "ful", "ness"], lang: "English" },
  { word: "seviyorum", segments: ["sev", "iyor", "um"], lang: "Turkish" },
  { word: "evlerimiz", segments: ["ev", "ler", "imiz"], lang: "Turkish" },
  { word: "güzellik", segments: ["güzel", "lik"], lang: "Turkish" },
  { word: "nitakupenda", segments: ["ni", "ta", "ku", "pend", "a"], lang: "Swahili" },
  { word: "tunafuraha", segments: ["tu", "na", "furah", "a"], lang: "Swahili" },
  { word: "talossani", segments: ["talo", "ssa", "ni"], lang: "Finnish" },
  { word: "Sonnenschein", segments: ["Sonnen", "schein"], lang: "German" },
  { word: "Freundschaft", segments: ["Freund", "schaft"], lang: "German" },
  { word: "ngiyakuthanda", segments: ["ngi", "ya", "ku", "thand", "a"], lang: "Zulu" },
  { word: "kebahagiaan", segments: ["ke", "bahagia", "an"], lang: "Indonesian" },
];

const [first, ...rest] = EXAMPLES;
const SHUFFLED_EXAMPLES = [first, ...rest.sort(() => Math.random() - 0.5)];

type Phase = "typing" | "pause" | "splitting" | "done";

export function DemoWidget() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typedLength, setTypedLength] = useState(0);
  const [showSegments, setShowSegments] = useState(false);

  const current = SHUFFLED_EXAMPLES[exampleIndex];

  useEffect(() => {
    if (phase === "typing") {
      if (typedLength < current.word.length) {
        const t = setTimeout(() => setTypedLength((n) => n + 1), 80);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("pause"), 400);
      return () => clearTimeout(t);
    }

    if (phase === "pause") {
      const t = setTimeout(() => setPhase("splitting"), 600);
      return () => clearTimeout(t);
    }

    if (phase === "splitting") {
      const t = setTimeout(() => { setShowSegments(true); setPhase("done"); }, 100);
      return () => clearTimeout(t);
    }

    if (phase === "done") {
      const t = setTimeout(() => {
        setPhase("typing");
        setTypedLength(0);
        setShowSegments(false);
        setExampleIndex((i) => (i + 1) % SHUFFLED_EXAMPLES.length);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [phase, typedLength, current.word.length]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8">
      {/* Input */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <p className="text-[11px] font-mono text-foreground/80 uppercase tracking-[0.25em]">Input</p>
          <span className="text-[10px] font-mono text-primary/80 px-2 py-0.5 rounded-full bg-primary/10">
            {current.lang}
          </span>
        </div>
        <div className="h-[60px] flex items-center justify-center">
          <span className="text-[clamp(2rem,5vw,3.5rem)] font-light text-foreground/30 tracking-wide">
            {current.word.slice(0, typedLength)}
          </span>
          {phase === "typing" && (
            <span className="text-[clamp(2rem,5vw,3.5rem)] font-light text-primary animate-pulse ml-0.5">|</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className={`transition-all duration-500 ${phase === "pause" || phase === "splitting" ? "opacity-100" : "opacity-40"}`}>
        <svg className="w-6 h-6 text-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Output */}
      <div className="text-center">
        <p className="text-[11px] font-mono text-foreground/80 uppercase tracking-[0.25em] mb-3">Output</p>
        <div className="h-[50px] flex items-center justify-center gap-3">
          {showSegments ? (
            current.segments.map((seg, i) => (
              <span key={`${exampleIndex}-${i}`} className="flex items-center gap-3">
                {i > 0 && (
                  <span
                    className="text-[clamp(1rem,2vw,1.5rem)] text-foreground/25 font-light animate-in fade-in duration-500"
                    style={{ animationDelay: `${i * 150 + 75}ms`, animationFillMode: "both" }}
                  >
                    +
                  </span>
                )}
                <span
                  className="text-[clamp(1.5rem,4vw,2.75rem)] font-medium text-primary tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-500"
                  style={{ animationDelay: `${i * 150}ms`, animationFillMode: "both" }}
                >
                  {seg}
                </span>
              </span>
            ))
          ) : (
            <span className="text-[clamp(1.5rem,4vw,2.75rem)] font-light text-foreground/10 tracking-wide">...</span>
          )}
        </div>
      </div>
    </div>
  );
}