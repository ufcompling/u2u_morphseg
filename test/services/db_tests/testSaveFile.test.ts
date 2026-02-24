import {describe, it, expect, vi, beforeEach} from 'vitest';
import {saveFile} from '../../../src/services/database/helpers/saveFile';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

function mockPython(filename: string, content: string) {
  return `import db_worker; db_worker.save_file('/data/${filename}', """${content}""") `;
}

describe('saveFile', () => {
  let pyodide: any;
  beforeEach(() => {
    pyodide = { 
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) }
    };
    vi.clearAllMocks();
  });

  it('should save file content correctly', async () => {
    const fileName = 'file.txt';
    const content = 'Hello, world!';
    pyodide.runPythonAsync.mockResolvedValueOnce(undefined);
    await saveFile(pyodide, fileName, content);
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(mockPython(fileName, content));
    expect(pyodideService.syncPyodideFS).toHaveBeenCalledWith(pyodide);
   });

  it('should handle binary content correctly', async () => {
    const fileName = 'binary.bin';
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02]);
    const content = String.fromCharCode(...binaryContent);
     pyodide.runPythonAsync.mockResolvedValueOnce(undefined);
    await saveFile(pyodide, fileName, content);
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(mockPython(fileName, content));
    expect(pyodideService.syncPyodideFS).toHaveBeenCalledWith(pyodide);
   });

  it('should handle empty content correctly', async () => {
    const fileName = 'empty.txt';
    const content = '';
    pyodide.runPythonAsync.mockResolvedValueOnce(undefined);
    await saveFile(pyodide, fileName, content);
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(mockPython(fileName, content));
    expect(pyodideService.syncPyodideFS).toHaveBeenCalledWith(pyodide);
   });

  it('should handle errors during file saving', async () => {
    const fileName = 'file.txt';
    const content = 'Hello, world!';
    pyodide.runPythonAsync.mockRejectedValueOnce(new Error('Saving error'));
    await expect(saveFile(pyodide, fileName, content)).rejects.toThrow('Saving error');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(mockPython(fileName, content));
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
   });
});