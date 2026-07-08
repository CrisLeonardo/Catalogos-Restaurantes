// Entry point único del agente (sirve para dev y para el .exe empaquetado).
//
//   LeoginAgent~LG1~<token>~.exe   → AUTOINSTALA (doble clic del cliente)
//   LeoginAgent.exe (ya instalado) → modo servicio (loop de polling)
//   LeoginAgent.exe list           → lista impresoras
//   LeoginAgent.exe test "preview:" → imprime un ticket de prueba
//   LeoginAgent.exe setup           → fuerza la instalación
//   LeoginAgent.exe uninstall       → desinstala (es el UninstallString de
//                                     "Aplicaciones instaladas" de Windows)
//   LeoginAgent.exe service         → fuerza el modo servicio
//
// En desarrollo es lo mismo con: node src/index.ts [comando]

import { basename } from 'node:path';
import { runAgent } from './agent.ts';
import { runCli } from './cli.ts';
import { runSetup, runUninstall, isInstalledLocation, registerUninstallEntry } from './setup.ts';
import { startLocalServer, startTlsServer } from './local-server.ts';
import { cleanupOldExe } from './updater.ts';
import { logger } from './logger.ts';

const CLI_COMMANDS = new Set(['list', 'test', 'send', 'help', '--help', '-h']);
const [first] = process.argv.slice(2);

// Sin esto, un binario SEA empaquetado puede morir en silencio (exit code 1,
// cero output) ante un error o rechazo no capturado — visto durante la
// vinculación por sesión de Leogin Desktop (instalador lanzado sin consola).
process.on('uncaughtException', (err) => {
  logger.error('excepción no capturada:', err?.stack ?? err);
  process.exitCode = 1;
});
process.on('unhandledRejection', (reason) => {
  logger.error('rechazo de promesa no capturado:', reason);
  process.exitCode = 1;
});

/** Arranca el daemon: candado de instancia única + loop de impresión. */
async function runService(): Promise<void> {
  const acquired = await startLocalServer();
  if (!acquired) {
    logger.info('Ya hay un agente de impresión corriendo en esta PC. Saliendo.');
    process.exit(0);
  }
  // HTTPS del hub: si ya hay certificado guardado de una corrida anterior,
  // arranca de una vez (si no, arrancará cuando el poll lo entregue).
  startTlsServer();
  // Si esta corrida es el resultado de un auto-update, borra el exe viejo y
  // refresca la versión mostrada en "Aplicaciones instaladas".
  cleanupOldExe();
  if (isInstalledLocation()) registerUninstallEntry(process.execPath);
  try {
    await runAgent({ once: !!process.env.LEOGIN_ONCE });
  } catch (err) {
    logger.error((err as Error)?.message ?? err);
    logger.info('Revisa la configuración (config.local.json o variables LEOGIN_*). Ver README.');
    process.exitCode = 1;
  }
}

function fail(err: unknown): void {
  logger.error((err as Error)?.message ?? err);
  process.exitCode = 1;
}

// ── Despacho ─────────────────────────────────────────────────────────────────
if (first && CLI_COMMANDS.has(first)) {
  runCli().catch(fail);
} else if (first === 'setup' || first === 'install') {
  runSetup().catch(fail);
} else if (first === 'uninstall') {
  runUninstall().catch(fail);
} else if (first === 'service' || first === 'run') {
  void runService();
} else {
  // Sin comando: decidir entre AUTOINSTALAR o correr el servicio.
  // - Es el instalador descargado (exe empaquetado fuera de la carpeta de
  //   instalación) → autoinstala.
  // - Ya está instalado, o es `node src/index.ts` en dev → corre el servicio.
  const looksPackaged = basename(process.execPath).toLowerCase().startsWith('leogin');
  if (looksPackaged && !isInstalledLocation()) {
    runSetup().catch(fail);
  } else {
    void runService();
  }
}
