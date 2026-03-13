// Used Copilot's autofill.
import { type fileData } from "../../lib/types";
declare const pyodide: any;
declare const language: string;

export async function loadFiles(): Promise<fileData[]> {
  if (!pyodide) {
    console.warn('loadFiles called before Pyodide initialized');
    return [];
  }
  // Ensure the language directory exists
  await pyodide.runPythonAsync(`import os; os.makedirs('/data/${language}', exist_ok=True)`);
  // Get file names in /data/${language}
  const fileIdsStr = await pyodide.runPythonAsync(`import os; import json; json.dumps(os.listdir('/data/${language}'))`);
  const fileIds = JSON.parse(fileIdsStr) as string[];
  // Get file stats for each file (size, createdAt)
  const statsStr = await pyodide.runPythonAsync(`\nimport os, json\nfile_stats = {}\nfor fname in os.listdir('/data/${language}'):\n    stat = os.stat(f'/data/${language}/{fname}')\n    file_stats[fname] = {\n        'fileSize': stat.st_size,\n        'createdAt': int(stat.st_ctime * 1000)\n    }\njson.dumps(file_stats)\n`);
  const fileStats = JSON.parse(statsStr);
  return fileIds.map((fileName: string) => ({
    fileName,
    filePath: `/${language}/${fileName}`,
    fileSize: fileStats[fileName]?.fileSize,
    createdAt: fileStats[fileName]?.createdAt
  } as fileData));
}