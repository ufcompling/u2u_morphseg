import {describe, it, expect, vi, beforeEach} from 'vitest';
// Type declaration for globalThis.pyodide
declare global {
  var pyodide: any;
  var language: string;
}
globalThis.pyodide = {
  runPythonAsync: vi.fn(),
  FS: { syncfs: vi.fn() },
  globals: {
    set: vi.fn(),
    get: vi.fn(),
  },
};
import {saveFile} from '../../../src/services/database/saveFile';
import * as pyodideService from '../../../src/services/pyodide/pyodideService';

vi.mock('../../../src/services/pyodide/pyodideService', () => ({
  syncPyodideFS: vi.fn().mockResolvedValue(undefined),
}));

function mockPython(filename: string, content: string | Uint8Array) {
  if (content instanceof Uint8Array) {
    return `import db_worker; db_worker.save_binary('${filename}', ${content})`;
  } else {
    return `import db_worker; db_worker.save_text('${filename}', """${content}""")`;
  }
}

describe('saveFile', () => {
  beforeEach(() => {
    globalThis.pyodide.runPythonAsync = vi.fn();
    globalThis.pyodide.FS = {
      syncfs: vi.fn((flush: boolean) => Promise.resolve()),
      writeFile: vi.fn(),
      mkdirTree: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should save file content correctly', async () => {
    const fileName = 'file.txt';
    const content = 'Hello, world!';
    await saveFile(fileName, content);
    const expectedBytes = new TextEncoder().encode(content);
    expect(globalThis.pyodide.FS.writeFile).toHaveBeenCalledWith(fileName, expectedBytes);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalled();
  });

  it('should handle binary content correctly', async () => {
    const fileName = 'binary.bin';
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02]);
    await saveFile(fileName, binaryContent);
    expect(globalThis.pyodide.FS.writeFile).toHaveBeenCalledWith(fileName, binaryContent);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalled();
  });

  it('should handle empty content correctly', async () => {
    const fileName = 'empty.txt';
    const content = '';
    await saveFile(fileName, content);
    const expectedBytes = new TextEncoder().encode(content);
    expect(globalThis.pyodide.FS.writeFile).toHaveBeenCalledWith(fileName, expectedBytes);
    expect(pyodideService.syncPyodideFS).toHaveBeenCalled();
  });

  it('should handle errors during file saving', async () => {
    const fileName = 'file.txt';
    const content = 'Hello, world!';
    globalThis.pyodide.FS.writeFile.mockImplementationOnce(() => { throw new Error('Saving error'); });
    await expect(saveFile(fileName, content)).rejects.toThrow('Saving error');
    expect(globalThis.pyodide.FS.writeFile).toHaveBeenCalledWith(fileName, new TextEncoder().encode(content));
    expect(pyodideService.syncPyodideFS).not.toHaveBeenCalled();
  });
});