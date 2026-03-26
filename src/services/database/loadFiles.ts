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
  let fileIds: string[] = [];
  try {
    const fileIdsStr: string = await pyodide.runPythonAsync(
      `import os, json; json.dumps(os.listdir('/data/${language}'))`
    );
    fileIds = JSON.parse(fileIdsStr) as string[];
  } catch (e) {
    console.error('[loadFiles] Error listing files:', e);
    return [];
  }

  // Read all file metadata + content in one Python call to avoid N round-trips
  // to the worker. Returns { fileName: { size, createdAt, content } }.
  let fileData: Record<string, { fileSize: number; createdAt: number; content: string }> = {};
  try {
    const dataStr: string = await pyodide.runPythonAsync(`
import os, json, db_worker
result = {}
for fname in os.listdir('/data/${language}'):
    fpath = f'/data/${language}/{fname}'
    stat = os.stat(fpath)
    try:
        raw = db_worker.read_file(fpath)
        parsed = json.loads(raw)
        content = parsed.get('content', '') if parsed.get('type') == 'text' else ''
    except Exception:
        content = ''
    result[fname] = {
        'fileSize': stat.st_size,
        'createdAt': int(stat.st_ctime * 1000),
        'content': content,
    }
json.dumps(result)
`);
    fileData = JSON.parse(dataStr);
  } catch (e) {
    console.error('[loadFiles] Error reading file data:', e);
    // Fall back to metadata-only (content will be empty, startTraining will re-read)
    return fileIds.map((fileName) => ({
      fileName,
      filePath: `/data/${language}/${fileName}`,
      fileSize: 0,
      createdAt: new Date(),
      fileContent: '',
      fileRole: null,
      fileType: 'text',
      validationStatus: 'pending',
    } as import("../../lib/types").fileData));
  }

  return fileIds.map((fileName) => ({
    fileName,
    filePath: `/data/${language}/${fileName}`,
    fileSize: fileData[fileName]?.fileSize ?? 0,
    createdAt: new Date(fileData[fileName]?.createdAt ?? Date.now()),
    fileContent: fileData[fileName]?.content ?? '',
    fileRole: null,       // roles are in-memory only (rolesMap in useTurtleShell)
    fileType: 'text',
    validationStatus: 'pending',
  } as import("../../lib/types").fileData));
}