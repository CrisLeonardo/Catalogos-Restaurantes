// Logger mínimo con timestamp. Sin dependencias.

type Level = 'info' | 'warn' | 'error' | 'debug';

function stamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function emit(level: Level, args: unknown[]): void {
  const prefix = `[${stamp()}] ${level.toUpperCase().padEnd(5)}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(prefix, ...args);
}

export const logger = {
  info: (...a: unknown[]) => emit('info', a),
  warn: (...a: unknown[]) => emit('warn', a),
  error: (...a: unknown[]) => emit('error', a),
  debug: (...a: unknown[]) => {
    if (process.env.LEOGIN_DEBUG) emit('debug', a);
  },
};
