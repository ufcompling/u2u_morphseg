// import { FileManager } from './components/FileManager';
import { AnalyzerModule } from './features/analyzer/AnalyzerModule';

// Temporary imports for testing if sklearn-crfsuite is working in Pyodide
import { useEffect } from 'react';
import { testSklearnCrfsuite } from '../test/features/testSklearnCrfsuite';

export default function App() {
  // return <FileManager />;

  // Temporary useEffect for testing if sklearn-crfsuite is working in Pyodide
  useEffect(() => {
    testSklearnCrfsuite();
  }, []);

  return <AnalyzerModule />;
}