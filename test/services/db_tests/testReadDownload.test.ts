import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readSnapshot } from '../../../src/services/database/readSnapshot';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

describe('readSnapshot', () => {
  let pyodide: any;
  let origLanguage: any;
  beforeEach(() => {
    pyodide = {
      runPython: vi.fn(),
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
      globals: {
        set: vi.fn(),
      },
    };
    // @ts-ignore
    globalThis.pyodide = pyodide;
    origLanguage = globalThis.language;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.language = origLanguage;
  });

  it('calls pyodide.runPythonAsync with correct args', async () => {
    globalThis.language = 'Finnish';
    await readSnapshot('SNAPSHOT_JSON');
    expect(pyodide.globals.set).toHaveBeenCalledWith('_snapshot_json', 'SNAPSHOT_JSON');
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(
      "import db_worker; db_worker.read_snapshot(_snapshot_json, '/data/Finnish')"
    );
  });

  it('throws if language is not set', async () => {
    globalThis.language = undefined;
    await expect(readSnapshot('SNAPSHOT_JSON')).rejects.toThrow('Language not set. Cannot restore snapshot.');
    expect(pyodide.globals.set).not.toHaveBeenCalled();
    expect(pyodide.runPythonAsync).not.toHaveBeenCalled();
  });

  it('throws if pyodide.runPythonAsync throws', async () => {
    globalThis.language = 'Finnish';
    pyodide.runPythonAsync.mockImplementation(() => { throw new Error('fail'); });
    await expect(readSnapshot('SNAPSHOT_JSON')).rejects.toThrow('fail');
  });
});
