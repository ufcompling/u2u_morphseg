/**
 * logger.ts
 * Location: src/lib/logger.ts
 *
 * Purpose:
 *   Thin wrapper around console that respects import.meta.env.DEV.
 *   Logs are visible during `vite dev` and silenced in production builds.
 *   Tagged output makes it easy to filter in devtools.
 *
 * Usage:
 *   import { log } from '@/lib/logger';
 *   const logger = log('pyodide');
 *   logger.info('Worker spawned');    // [pyodide] Worker spawned
 *   logger.error('Init failed', err); // [pyodide] Init failed Error: ...
 */

const IS_DEV = import.meta.env.DEV;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function log(tag: string): Logger {
  const prefix = `[${tag}]`;

  if (!IS_DEV) {
    return { info: noop, warn: noop, error: noop };
  }

  return {
    info: (...args: unknown[]) => console.log(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}