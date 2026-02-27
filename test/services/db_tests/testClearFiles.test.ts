import {describe, it, expect, vi, beforeEach} from 'vitest';
import {clearFiles} from '../../../src/services/database/helpers/clearFiles';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';
vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));
describe('clearFiles', () => {
  let pyodide: any;
  beforeEach(() => {
    pyodide = { 
      runPythonAsync: vi.fn(),
      FS: { syncfs: vi.fn((flush: boolean) => Promise.resolve()) }
    };
    vi.clearAllMocks();
  });

  it('should clear all files in the /data directory', async () => {
    pyodide.runPythonAsync.mockResolvedValue(undefined);

    await clearFiles(pyodide);

    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.clear_files('/data')`);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalledWith(pyodide);
  });

  it('should handle errors during clearing', async () => {
    const error = new Error('Clear error');
    pyodide.runPythonAsync.mockRejectedValue(error);
    await expect(clearFiles(pyodide)).rejects.toThrow('Clear error');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(`import db_worker; db_worker.clear_files('/data')`);
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
  });
});