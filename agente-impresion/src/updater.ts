// Auto-update del agente (ver plataforma/docs/ESTRATEGIA_INSTALABLE.md §3.2).
//
// Flujo (modelo Chrome, a escala chica):
//   1. Cada ~1h (y al arrancar) pregunta a /api/agent/latest el release
//      vigente de SU canal (stable/beta — se controla por restaurante en la
//      nube, migración 065).
//   2. Si la versión es mayor: descarga el exe, verifica el sha256 contra el
//      manifest (que viaja por el canal autenticado), y hace el intercambio:
//      el exe corriendo se renombra a .old (Windows lo permite en caliente),
//      el nuevo toma su lugar, y el proceso sale — la Tarea Programada lo
//      relanza en ≤3 min ya con la versión nueva.
//   3. Al arrancar, la versión nueva borra el .old (si quedó). Si un release
//      sale malo: enabled=false en la nube lo frena (kill switch), y el .old
//      queda en disco para revertir a mano mientras tanto.
//
// Solo corre cuando el proceso ES el exe instalado — en desarrollo
// (node src/index.ts) no hace nada.

import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isInstalledLocation } from './setup.ts';
import type { AgentConfig } from './config.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

const OLD_EXE = 'LeoginAgent.old.exe';
const NEW_EXE = 'LeoginAgent.new.exe';

interface Release {
  version: string;
  url: string;
  sha256: string;
  notes?: string | null;
}

/** true si `candidate` es estrictamente mayor que `current` (x.y.z numérico). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** Borra el exe viejo que dejó una actualización anterior (best-effort: puede
    seguir bloqueado unos segundos si el proceso anterior aún muere). */
export function cleanupOldExe(): void {
  if (!isInstalledLocation()) return;
  const oldPath = join(dirname(process.execPath), OLD_EXE);
  try {
    if (existsSync(oldPath)) {
      rmSync(oldPath, { force: true });
      logger.info('Versión anterior eliminada tras la actualización.');
    }
  } catch {
    /* la próxima corrida lo intenta de nuevo */
  }
}

/**
 * Revisa si hay versión nueva y, si la hay, la instala y TERMINA el proceso
 * (exit 0) para que el watchdog relance el exe nuevo. El llamador controla la
 * frecuencia. Cualquier fallo es no-fatal: se loguea y se reintenta en el
 * próximo ciclo.
 */
export async function checkForUpdate(cfg: AgentConfig): Promise<void> {
  if (!isInstalledLocation()) return; // en dev (node src/index.ts) no aplica

  let release: Release | null = null;
  try {
    const res = await fetch(`${cfg.apiUrl}/api/agent/latest`, {
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`latest respondió HTTP ${res.status}`);
    release = ((await res.json()) as { release?: Release | null }).release ?? null;
  } catch (e) {
    logger.warn('No se pudo consultar actualizaciones:', (e as Error).message);
    return;
  }

  if (!release || !isNewerVersion(release.version, AGENT_VERSION)) return;
  logger.info(`Actualización disponible: v${AGENT_VERSION} → v${release.version}. Descargando…`);

  const dir = dirname(process.execPath);
  const newPath = join(dir, NEW_EXE);
  const oldPath = join(dir, OLD_EXE);

  try {
    const res = await fetch(release.url);
    if (!res.ok) throw new Error(`descarga respondió HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());

    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest.toLowerCase() !== release.sha256.toLowerCase()) {
      throw new Error(`sha256 no coincide (esperado ${release.sha256.slice(0, 12)}…, recibido ${digest.slice(0, 12)}…)`);
    }

    writeFileSync(newPath, bytes);

    // Intercambio en caliente: renombrar el exe en ejecución es válido en
    // Windows; el archivo nuevo toma el nombre real y el relanzamiento del
    // watchdog ya corre la versión nueva.
    rmSync(oldPath, { force: true });
    renameSync(process.execPath, oldPath);
    renameSync(newPath, process.execPath);

    logger.info(`✓ v${release.version} instalada. Reiniciando para aplicarla…`);
    process.exit(0);
  } catch (e) {
    logger.warn('Fallo la actualización (se reintentará):', (e as Error).message);
    try {
      rmSync(newPath, { force: true });
    } catch {
      /* ignora */
    }
  }
}
