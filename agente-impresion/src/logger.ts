// Logger mínimo con timestamp. Sin dependencias.
//
// Escribe en DOS sitios y ninguno depende del otro:
//
//  1. Un archivo en la carpeta del agente (agente.log, con rotación simple).
//     Antes solo iba a consola, y como el agente arranca oculto esa consola no
//     la ve nadie: cuando un restaurante decía "no imprime", no había ni una
//     línea que mirar. Ahora hay un archivo al que pedirle al dueño que le
//     saque una foto.
//
//  2. La consola, si existe. A partir de que el exe se compila como binario
//     de ventana (sin consola — ver build-exe.mjs), `process.stdout` puede
//     apuntar a un descriptor inválido y un `console.log` normal llegaría a
//     lanzar excepción. Por eso va envuelto: perder una línea de log jamás
//     puede tumbar el servicio de impresión del local.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

type Level = 'info' | 'warn' | 'error' | 'debug';

/** Tope del archivo antes de rotar. Un log de impresión crece despacio. */
const MAX_BYTES = 2 * 1024 * 1024;

function stamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Carpeta donde vive el exe en ejecución; si falla, la temporal del sistema. */
function logPath(): string {
  try {
    return join(dirname(process.execPath), 'agente.log');
  } catch {
    return join(tmpdir(), 'leogin-agente.log');
  }
}

/** Rota a .1 cuando pasa del tope. Solo se guarda una generación anterior. */
function rotateIfBig(file: string): void {
  try {
    if (statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    /* no existe todavía, o no se pudo rotar: seguimos escribiendo igual */
  }
}

function writeFile(line: string): void {
  const file = logPath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    rotateIfBig(file);
    appendFileSync(file, line + '\r\n', 'utf8');
  } catch {
    /* disco lleno o sin permiso: no es motivo para tumbar el agente */
  }
}

/** Consola blindada: sin consola adjunta, escribir puede lanzar. */
function writeConsole(level: Level, prefix: string, args: unknown[]): void {
  try {
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(prefix, ...args);
  } catch {
    /* sin consola (binario de ventana) — el archivo ya guardó la línea */
  }
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function emit(level: Level, args: unknown[]): void {
  const prefix = `[${stamp()}] ${level.toUpperCase().padEnd(5)}`;
  writeFile(`${prefix} ${format(args)}`);
  writeConsole(level, prefix, args);
}

export const logger = {
  info: (...a: unknown[]) => emit('info', a),
  warn: (...a: unknown[]) => emit('warn', a),
  error: (...a: unknown[]) => emit('error', a),
  debug: (...a: unknown[]) => {
    if (process.env.LEOGIN_DEBUG) emit('debug', a);
  },
  /** Ruta del archivo de log — para enseñarla en la página de estado del hub. */
  file: logPath,
};
