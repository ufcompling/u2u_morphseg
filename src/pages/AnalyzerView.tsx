import { AnalyzerModule } from "../features/analyzer/AnalyzerModule";
import { TurtleShellBackground } from "../layouts/turtle-background";

export function AnalyzerView(){

  return (
    <>
      <TurtleShellBackground />
      <AnalyzerModule/>
    </>

  );

}