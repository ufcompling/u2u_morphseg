import {describe, it, expect, vi, beforeEach} from 'vitest';
// Type declaration for globalThis.pyodide
declare global {
  var pyodide: any;
  var language: string;
}
import {clearFiles} from '../../../src/services/database/clearFiles';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';
vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));
describe('clearFiles', () => {
  beforeEach(() => {
    globalThis.pyodide = {
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) }
    };
    globalThis.language = 'English';
    vi.clearAllMocks();
  });

  it('should clear all files in the /data directory', async () => {
    pyodide.runPythonAsync.mockResolvedValue(undefined);

    await clearFiles();

    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.clear_files('/data')`);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalled();
  });

  it('should handle errors during clearing', async () => {
    const error = new Error('Clear error');
    pyodide.runPythonAsync.mockRejectedValue(error);
    await expect(clearFiles()).rejects.toThrow('Clear error');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.clear_files('/data')`);
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
  });
});