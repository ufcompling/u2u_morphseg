import {describe, it, expect, vi, beforeEach} from 'vitest';
// Type declaration for globalThis.pyodide
declare global {
  var pyodide: any;
  var language: string;
}
import {loadFiles} from '../../../src/services/database/loadFiles';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

describe('loadFiles', () => {
  beforeEach(() => {
    globalThis.pyodide = {
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) },
    };
    globalThis.language = 'English';

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
    const result = await loadFiles();
    expect(result).toEqual([
      {
        fileName: 'file1.txt',
        filePath: '/data/English/file1.txt',
        fileContent: '',
        fileRole: null,
        fileType: 'text',
        fileSize: 0,
        validationStatus: 'pending',
        createdAt: expect.any(Date),
      },
      {
        fileName: 'file2.txt',
        filePath: '/data/English/file2.txt',
        fileContent: '',
        fileRole: null,
        fileType: 'text',
        fileSize: 0,
        validationStatus: 'pending',
        createdAt: expect.any(Date),
      },
    ]);
  });

  it('should handle binary file content', async () => {
    mockPython({
      'binary.bin': { content: 'AAECAw==', type: 'binary' },
    });
    const result = await loadFiles();
    expect(result).toEqual([
      {
        fileName: 'binary.bin',
        filePath: '/data/English/binary.bin',
        fileContent: '',
        fileRole: null,
        fileType: 'text',
        fileSize: 0,
        validationStatus: 'pending',
        createdAt: expect.any(Date),
      },
    ]);
  });

  it('should handle empty file content', async () => {
    mockPython({ 'empty.txt': { content: '', type: 'text' } });
    const result = await loadFiles();
    expect(result).toEqual([
      {
        fileName: 'empty.txt',
        filePath: '/data/English/empty.txt',
        fileContent: '',
        fileRole: null,
        fileType: 'text',
        fileSize: 0,
        validationStatus: 'pending',
        createdAt: expect.any(Date),
      },
    ]);
  });

  it('should handle file read errors', async () => {
    mockPython({ 'file.txt': new Error('File read error') });
    const result = await loadFiles();
    expect(result).toEqual([
      {
        fileName: 'file.txt',
        filePath: '/data/English/file.txt',
        fileContent: '',
        fileRole: null,
        fileType: 'text',
        fileSize: 0,
        validationStatus: 'pending',
        createdAt: expect.any(Date),
      },
    ]);
  });
});

