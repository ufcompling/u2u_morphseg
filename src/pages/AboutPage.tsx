import { TurtleShellBackground } from "../components/layout";

export function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col pt-24 px-8 lg:px-20 max-w-4xl mx-auto w-full relative">
      <TurtleShellBackground />
      
      <div className="relative z-10 bg-card/50 backdrop-blur-xl border border-border/20 rounded-2xl p-8 md:p-12 shadow-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-6">About Turtleshell</h1>
        
        <div className="space-y-6 text-foreground/80 leading-relaxed font-mono text-sm">
          <section>
            <h2 className="text-primary font-semibold uppercase tracking-wider text-xs mb-3">Project Overview</h2>
            <p>
              Turtleshell is a specialized tool designed for morphological segmentation using Active Learning. 
              It allows linguists and NLP researchers to train Conditional Random Field (CRF) models directly 
              in the browser without needing to set up a complex Python environment or upload sensitive data to a server.
            </p>
          </section>

          <section>
            <h2 className="text-primary font-semibold uppercase tracking-wider text-xs mb-3">Active Learning</h2>
            <p>
              Labeling morphological data is time-consuming. Turtleshell uses uncertainty sampling to identify 
              the specific words that the current model is most "confused" about. By annotating only these 
              high-impact samples, you can achieve higher accuracy with significantly fewer annotations.
            </p>
          </section>

          <section>
            <h2 className="text-primary font-semibold uppercase tracking-wider text-xs mb-3">Technology</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><span className="text-foreground font-medium">Pyodide:</span> Runs a full Python stack in a WebWorker via WebAssembly.</li>
              <li><span className="text-foreground font-medium">CRFSuite:</span> Provides fast and efficient Conditional Random Field training.</li>
              <li><span className="text-foreground font-medium">IndexedDB:</span> Persists your models and datasets locally in your browser.</li>
              <li><span className="text-foreground font-medium">React & Tailwind:</span> Ensures a responsive and modern user interface.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-primary font-semibold uppercase tracking-wider text-xs mb-3">Privacy First</h2>
            <p>
              Your data never leaves your machine. All processing, training, and storage happens locally 
              within your browser's sandbox. This makes Turtleshell ideal for working with low-resource 
              or sensitive linguistic materials.
            </p>
          </section>
        </div>
      </div>

      <footer className="mt-12 text-center text-[10px] text-muted-foreground/40 font-mono tracking-widest uppercase">
        Built with Pyodide + React + TypeScript
      </footer>
    </div>
  );
}
