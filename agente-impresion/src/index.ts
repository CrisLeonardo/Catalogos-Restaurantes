// Entry point único del agente (sirve para dev y para el .exe empaquetado).
//
//   LeoginAgent.exe                 → modo servicio (loop de polling)
//   LeoginAgent.exe list            → lista impresoras
//   LeoginAgent.exe test "preview:" → imprime un ticket de prueba
//
// En desarrollo es lo mismo con: node src/index.ts [comando]

import { runAgent } from './agent.ts';
import { runCli } from './cli.ts';
import { startLocalServer } from './local-server.ts';
import { logger } from './logger.ts';

const CLI_COMMANDS = new Set(['list', 'test', 'send', 'help', '--help', '-h']);
const [first] = process.argv.slice(2);

if (first && CLI_COMMANDS.has(first)) {
  runCli().catch((err: unknown) => {
    logger.error((err as Error)?.message ?? err);
    process.exitCode = 1;
  });
} else {
  void (async () => {
    // Instancia única: si ya hay un agente en esta PC, salir sin imprimir
    // (la Tarea Programada reintenta cada pocos minutos → recuperación ante caídas).
    const acquired = await startLocalServer();
    if (!acquired) {
      logger.info('Ya hay un agente de impresión corriendo en esta PC. Saliendo.');
      process.exit(0);
    }
    try {
      await runAgent({ once: !!process.env.LEOGIN_ONCE });
    } catch (err) {
      logger.error((err as Error)?.message ?? err);
      logger.info('Revisa la configuración (LEOGIN_API_URL y LEOGIN_AGENT_TOKEN, o config.local.json). Ver README.');
      process.exitCode = 1;
    }
  })();
}
