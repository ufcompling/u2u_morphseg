import {describe, it, expect, vi, beforeEach} from 'vitest';
import {importFiles} from '../../../src/services/database/helpers/importFiles';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));


function arrayToList(files: File[]) : FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index],
    ...files.reduce((acc, file, index) => ({ ...acc, [index]: file }), {})
  } as unknown as FileList;
  return fileList;
}

describe('importFiles', () => {
  let pyodide: any;
  let saved: Record<string, any>;
  beforeEach(() => {
    saved = {};
    pyodide = {
      runPythonAsync: vi.fn(),
      globals: {
        set: vi.fn((k, v) => { (pyodide as any)[k] = v; }),
        get: vi.fn(k => (pyodide as any)[k]),
      },
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) },
    };
    vi.clearAllMocks();
  });

  function mockPython(existing: string[]) {
    saved = {};
    pyodide.runPythonAsync.mockImplementation((arg: string) => {
      if (arg.includes('os.listdir')) {
        return Promise.resolve(JSON.stringify(existing));
      }
      if (arg.includes('save_base64')) {
        const m = arg.match(/save_base64\('\/data\/([^']+)'/);
        const fileName = m![1];
        saved[fileName] = pyodide.globals.get('b64_content');
        return Promise.resolve('');
      }
      if (arg.includes('save_file')) {
        const m = arg.match(/save_file\('\/data\/([^']+)'/);
        const fileName = m![1];
        saved[fileName] = arg.split('"""')[1];
        return Promise.resolve('');
      }
      return Promise.resolve('');
    });
    return saved;
  }

  it('should import files and return their content', async () => {
    const mockFile1 = new File(['content of file 1'], 'file1.txt', { type: 'text/plain' });
    const mockFile2 = new File(['content of file 2'], 'file2.txt', { type: 'text/plain' });

    mockPython([]);
    const fileList = arrayToList([mockFile1, mockFile2]);
    const status = vi.fn();

    await importFiles(pyodide, fileList, status);

    expect(saved).toEqual({
      'file1.txt': 'content of file 1',
      'file2.txt': 'content of file 2',
    });
  });

  it('should handle binary file content', async () => {
    const binaryContent = new Uint8Array([0, 1, 2, 3]);
    const mockFile = new File([binaryContent], 'binary.bin', { type: 'application/octet-stream' });
    mockPython([]);
    const fileList = arrayToList([mockFile]);
    const status = vi.fn();

    await importFiles(pyodide, fileList, status);
    expect(saved).toEqual({
      'binary.bin': 'AAECAw==',
    });
  });

  it('should skip files with ID collisions', async () => {
    const mockFile = new File(['content'], 'file1.txt', { type: 'text/plain' });
    mockPython(['file1.txt']);
    const fileList = arrayToList([mockFile]);
    const status = vi.fn();

    await importFiles(pyodide, fileList, status);

    expect(saved).toEqual({});
    expect(status).toHaveBeenCalledWith('ID collision for file1.txt. Skipping.');
  });

  it('should handle errors during import', async () => {
    const mockFile = new File(['content'], 'file1.txt', { type: 'text/plain' });
    pyodide.runPythonAsync
      .mockResolvedValueOnce(JSON.stringify([]))
      .mockRejectedValueOnce(new Error('Import error'));

    const fileList = arrayToList([mockFile]);
    const status = vi.fn();

    await importFiles(pyodide, fileList, status);

    expect(saved).toEqual({});
    expect(status).toHaveBeenCalledWith('Failed to import file1.txt');
  });
});