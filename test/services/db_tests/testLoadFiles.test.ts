import {describe, it, expect, vi, beforeEach} from 'vitest';
import {loadFiles} from '../../../src/services/database/helpers/loadFiles';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

describe('loadFiles', () => {
  let pyodide: any;
  beforeEach(() => {
    pyodide = {
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) },
    };
    vi.clearAllMocks();
  });
 
  function mockPython(fileMap: Record<string, {content: any; type: 'text' | 'binary'} | Error>) {
    pyodide.runPythonAsync.mockImplementation((arg: string) => {
      if (arg.includes('os.listdir')) {
        return Promise.resolve(JSON.stringify(Object.keys(fileMap)));
      }
      const m = arg.match(/read_file\('\/data\/([^']+)'\)/);
      if (!m) return Promise.resolve('');
      const fileName = m[1];
      const fileData = fileMap[fileName];
      if (fileData instanceof Error) {
        return Promise.reject(fileData);
      }
      if (fileData == null) {
        return Promise.resolve(JSON.stringify({content: null, type: 'text'}));
      }
      return Promise.resolve(JSON.stringify({content: fileData.content, type: fileData.type}));
    });
  }
  
  it('should load files and return their content', async () => {
    mockPython({
      'file1.txt': { content: 'content of file 1', type: 'text' },
      'file2.txt': { content: 'content of file 2', type: 'text' },
    });
    const result = await loadFiles(pyodide);
    expect(result).toEqual([
      {
        fileName: 'file1.txt',
      fileContent: 'content of file 1',
      fileType: 'text',
      fileSize: 'content of file 1'.length,
      processedFileContent: null,
      },
      {
        fileName: 'file2.txt',
        fileContent: 'content of file 2',
        fileType: 'text',
        fileSize: 'content of file 2'.length,
        processedFileContent: null,
      },
    ]);
  });

  it('should handle binary file content', async () => {
    mockPython({
      'binary.bin': { content: 'AAECAw==', type: 'binary' },
    });
    const result = await loadFiles(pyodide);
    expect(result).toEqual([
      {
        fileName: 'binary.bin',
        fileContent: 'AAECAw==',
        fileType: 'binary',
        fileSize: 4,
        processedFileContent: null,
      },
    ]);
  });

  it('should handle empty file content', async () => {
    mockPython({ 'empty.txt': { content: '', type: 'text' } });
    const result = await loadFiles(pyodide);
    expect(result).toEqual([
      {
        fileName: 'empty.txt',
        fileContent: '',
        fileType: 'text',
        fileSize: 0,
        processedFileContent: null,
      },
    ]);
  });

  it('should handle file read errors', async () => {
    mockPython({ 'file.txt': new Error('File read error') });
    const result = await loadFiles(pyodide);
    expect(result).toEqual([]);
  });
});

