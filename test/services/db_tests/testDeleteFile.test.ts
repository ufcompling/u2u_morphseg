import {describe, it, expect, vi, beforeEach} from 'vitest';
// Type declaration for globalThis.pyodide
declare global {
  var pyodide: any;
  var language: string;
}
import {deleteFile} from '../../../src/services/database/deleteFile';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';
vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));
describe('deleteFile', () => {
  beforeEach(() => {
    globalThis.pyodide = {
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) }
    };
    globalThis.language = 'English';

    vi.clearAllMocks();
  });

  it('should delete file and sync pyodide.runPythonAsync FS', async () => {
    const fileName = 'file.txt';
    const filePath = `/data/English/${fileName}`;
    pyodide.runPythonAsync.mockResolvedValueOnce(undefined);
    await deleteFile(filePath);
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.delete_file('${filePath}')`);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalled();
    
   });

  it('should handle errors during file deletion', async () => {
    const fileName = 'file.txt';
    const filePath = `/data/English/${fileName}`;
    pyodide.runPythonAsync.mockRejectedValueOnce(new Error('Deletion error'));
    await expect(deleteFile(filePath)).rejects.toThrow('Deletion error');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.delete_file('${filePath}')`);
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
   });
});