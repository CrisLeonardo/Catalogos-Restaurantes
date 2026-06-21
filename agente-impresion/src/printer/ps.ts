// Ejecuta scripts de PowerShell. Los scripts viajan INCRUSTADOS en el binario
// (ver ../ps-scripts.ts) y se materializan a una carpeta temporal la primera vez
// que se usan, para que el agente sea un único archivo .exe sin carpeta scripts/
// al lado. (Compatibilidad: si existe un scripts/ junto al exe o en el árbol
// fuente, se respeta — útil en desarrollo.)

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PS_SCRIPTS } from '../ps-scripts.ts';
import { AGENT_VERSION } from '../version.ts';

let cachedDir: string | null = null;

/** Escribe los scripts incrustados en una carpeta temporal (una sola vez). */
function materializeEmbedded(): string {
  if (cachedDir) return cachedDir;
  // La versión en la ruta hace que un agente actualizado reescriba sus scripts.
  const dir = join(tmpdir(), 'leogin-agente', `scripts-${AGENT_VERSION}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(PS_SCRIPTS)) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      // BOM UTF-8: PowerShell 5.1 lee así los acentos correctamente.
      writeFileSync(path, '﻿' + content, 'utf8');
    }
  }
  cachedDir = dir;
  return dir;
}

function resolveScript(name: string): string {
  // Preferimos un scripts/ real si existe (dev o instalación con sidecar);
  // si no, usamos los scripts incrustados.
  const sidecars = [
    join(dirname(process.execPath), 'scripts', name),
    join(process.cwd(), 'scripts', name),
    join(process.cwd(), 'agente-impresion', 'scripts', name),
  ];
  for (const c of sidecars) {
    if (existsSync(c)) return c;
  }
  return join(materializeEmbedded(), name);
}

export function runPsFile(
  scriptName: string,
  args: string[] = [],
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const scriptPath = resolveScript(scriptName);
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true, timeout: opts.timeoutMs ?? 20_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr && stderr.trim()) || err.message;
          reject(new Error(detail));
          return;
        }
        resolve(stdout.toString().trim());
      },
    );
  });
}
