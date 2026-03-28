import { DemoWidget } from "../features/landing/demowidget";
import { CheckIcon } from "../components/ui/icons";

interface Props {
  onEnter: () => void;
}

const BADGES = ["Privacy-first", "No account required", "Multi-Language Support"];

export function LandingPage({ onEnter }: Props) {
  return (
    <div className="h-screen bg-background flex flex-col pt-14">
      <div className="flex-1 flex items-center px-8 lg:px-20 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center w-full gap-12 lg:gap-20">
          {/* Left */}
          <div className="flex-1 max-w-xl">
            <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold text-foreground tracking-[-0.02em] leading-[1.1]">
              Active learning for morphological segmentation
            </h1>
            <p className="mt-5 text-[15px] text-foreground/50 leading-relaxed max-w-md">
              Train CRF models in your browser. Annotate only the words the model is uncertain about. Iterate toward better accuracy.
            </p>
            <div className="mt-8">
              <button
                onClick={onEnter}
                className="cta-glow inline-flex px-6 py-3 rounded-full bg-primary text-primary-foreground text-[14px] font-semibold transition-all duration-300 active:scale-[0.98]"
              >
                Start annotating
              </button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              {BADGES.map((badge) => (
                <div key={badge} className="flex items-center gap-2">
                  <CheckIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[12px] text-foreground/40">{badge}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="flex-1 flex items-center justify-center">
            <DemoWidget/>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-8 lg:px-20 py-4 border-t border-foreground/10 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-6">
          <span className="text-[11px] text-foreground/50">Runs in-browser</span>
          <span className="text-[11px] text-foreground/50">No uploads</span>
        </div>
        <span className="text-[11px] text-foreground/40">Built for linguists and NLP researchers</span>
      </div>
    </div>
  );
}