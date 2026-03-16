// Used Copilot's autofill.
import { type fileData } from "../../lib/types";
declare const pyodide: any;
declare const language: string;

export async function loadFiles(): Promise<fileData[]> {
  if (!pyodide) {
    console.warn('loadFiles called before Pyodide initialized');
    return [];
  }
  if (!language) {
    console.error('[loadFiles] language is undefined!');
    return [];
  }
  try {
    // Ensure the language directory exists
    await pyodide.runPythonAsync(`import os; os.makedirs('/data/${language}', exist_ok=True)`);
  } catch (e) {
    console.error('[loadFiles] Error creating language directory:', e);
    return [];
  }
  let fileIdsStr = '';
  let fileIds: string[] = [];
  try {
    fileIdsStr = await pyodide.runPythonAsync(`import os; import json; json.dumps(os.listdir('/data/${language}'))`);
    fileIds = JSON.parse(fileIdsStr) as string[];
  } catch (e) {
    console.error('[loadFiles] Error listing files:', e);
    return [];
  }
  let statsStr = '';
  let fileStats: any = {};
  try {
    statsStr = await pyodide.runPythonAsync(`\nimport os, json\nfile_stats = {}\nfor fname in os.listdir('/data/${language}'):\n    stat = os.stat(f'/data/${language}/{fname}')\n    file_stats[fname] = {\n        'fileSize': stat.st_size,\n        'createdAt': int(stat.st_ctime * 1000)\n    }\njson.dumps(file_stats)\n`);
    fileStats = JSON.parse(statsStr);
  } catch (e) {
    console.error('[loadFiles] Error getting file stats:', e);
    return [];
  }
  const result = fileIds.map((fileName: string) => ({
    fileName,
    filePath: `/data/${language}/${fileName}`,
    fileSize: fileStats[fileName]?.fileSize,
    createdAt: fileStats[fileName]?.createdAt
  } as fileData));
  return result;
}