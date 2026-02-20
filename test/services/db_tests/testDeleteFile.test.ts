import {describe, it, expect, vi, beforeEach} from 'vitest';
import {deleteFile} from '../../../src/services/database/helpers/deleteFile';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';
vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));
describe('deleteFile', () => {
  let pyodide: any;
  beforeEach(() => {
    pyodide = { 
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) }
    };
    vi.clearAllMocks();
  });

  it('should delete file and sync pyodide.runPythonAsync FS', async () => {
    const fileName = 'file.txt';
    pyodide.runPythonAsync.mockResolvedValueOnce(undefined);
    await deleteFile(pyodide, fileName);
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.delete_file('/data/${fileName}')`);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalledWith(pyodide);
    
   });

  it('should handle errors during file deletion', async () => {
    const fileName = 'file.txt';
    pyodide.runPythonAsync.mockRejectedValueOnce(new Error('Deletion error'));
    await expect(deleteFile(pyodide, fileName)).rejects.toThrow('Deletion error');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.delete_file('/data/${fileName}')`);
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
   });
});