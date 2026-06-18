// Ejecuta scripts de PowerShell que acompañan al agente.
// Resuelve la carpeta `scripts/` tanto en dev (árbol fuente) como empaquetado
// (junto al .exe). No usa import.meta.url para ser compatible con el bundle CJS.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function resolveScript(name: string): string {
  const candidates = [
    join(dirname(process.execPath), 'scripts', name), // empaquetado: exe + scripts/ al lado
    join(process.cwd(), 'scripts', name),             // dev: corrido desde la carpeta del agente
    join(process.cwd(), 'agente-impresion', 'scripts', name),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
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
