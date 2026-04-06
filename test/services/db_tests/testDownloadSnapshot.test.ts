import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadSnapshot } from '../../../src/services/database/downloadSnapshot';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

describe('downloadSnapshot', () => {
  let pyodide: any;
  let origLanguage: any;
  beforeEach(() => {
    pyodide = {
      runPython: vi.fn(),
    };
    // @ts-ignore
    globalThis.pyodide = pyodide;
    origLanguage = globalThis.language;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore language global
    globalThis.language = origLanguage;
  });

  it('returns snapshot string on success', async () => {
    globalThis.language = 'Finnish';
    pyodide.runPython.mockReturnValue('SNAPSHOT_JSON');
    const result = await downloadSnapshot();
    expect(result).toBe('SNAPSHOT_JSON');
    expect(pyodide.runPython).toHaveBeenCalledWith(
      "import db_worker; db_worker.get_snapshot('/data/Finnish')"
    );
  });

  it('throws if language is not set', async () => {
    globalThis.language = undefined;
    await expect(downloadSnapshot()).rejects.toThrow('Language not set. Cannot download snapshot.');
    expect(pyodide.runPython).not.toHaveBeenCalled();
  });

  it('throws if pyodide.runPython throws', async () => {
    globalThis.language = 'Finnish';
    pyodide.runPython.mockImplementation(() => { throw new Error('fail'); });
    await expect(downloadSnapshot()).rejects.toThrow('fail');
  });
});
