// Used Copilot's autofill.
import { type fileData } from "./dataHelpers";
declare const pyodide: any;

export async function loadFiles(): Promise<fileData[]> {
  if (!pyodide) {
    console.warn('loadFiles called before Pyodide initialized');
    return [];
  }
  // Get file names in /data
  const fileIdsStr = await pyodide.runPythonAsync(`import os; import json; json.dumps(os.listdir('/data'))`);
  const fileIds = JSON.parse(fileIdsStr) as string[];
  // Get file stats for each file (size, createdAt)
  const statsStr = await pyodide.runPythonAsync(`\nimport os, json\nfile_stats = {}\nfor fname in os.listdir('/data'):\n    stat = os.stat(f'/data/{fname}')\n    file_stats[fname] = {\n        'fileSize': stat.st_size,\n        'createdAt': int(stat.st_ctime * 1000)\n    }\njson.dumps(file_stats)\n`);
  const fileStats = JSON.parse(statsStr);
  return fileIds.map((fileName: string) => ({
    fileName,
    filePath: '/data/' + fileName,
    fileSize: fileStats[fileName]?.fileSize,
    createdAt: fileStats[fileName]?.createdAt
  } as fileData));
}