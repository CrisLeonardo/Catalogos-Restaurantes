// CLI de pruebas del agente. Permite validar el hardware ANTES de conectar la nube.
//
//   node src/cli.ts list                          → lista impresoras instaladas
//   node src/cli.ts test "windows:EPSON TM-T20"   → imprime un ticket de prueba
//   node src/cli.ts test tcp://192.168.1.50:9100  → prueba una impresora de red
//   node src/cli.ts send <destino> <archivo.bin>  → envía bytes crudos (debug)

import { readFile } from 'node:fs/promises';
import { discoverPrinters, parseTarget, printRaw, formatTarget } from './printer/index.ts';
import { buildTestTicket } from './escpos.ts';
import { logger } from './logger.ts';

async function cmdList(): Promise<void> {
  const printers = await discoverPrinters();
  if (printers.length === 0) {
    logger.warn('No se detectaron impresoras instaladas en Windows.');
    logger.warn('Si tu impresora es de red por IP, usa: test tcp://IP:9100');
    return;
  }
  logger.info(`${printers.length} impresora(s) detectada(s):\n`);
  for (const p of printers) {
    const flags = [p.shared ? 'compartida' : null, p.status].filter(Boolean).join(', ');
    console.log(`  • ${p.name}`);
    console.log(`      destino : ${p.target}`);
    if (p.driver) console.log(`      driver  : ${p.driver}`);
    if (p.port) console.log(`      puerto  : ${p.port}`);
    if (flags) console.log(`      estado  : ${flags}`);
    console.log('');
  }
  console.log('Para probar:  node src/cli.ts test "<destino>"');
}

async function cmdTest(args: string[]): Promise<void> {
  const dest = args[0];
  if (!dest) {
    logger.error('Falta el destino. Ej: node src/cli.ts test "windows:EPSON TM-T20"');
    process.exitCode = 1;
    return;
  }
  const target = parseTarget(dest);
  logger.info(`Enviando ticket de prueba a ${formatTarget(target)} ...`);
  await printRaw(target, buildTestTicket());
  logger.info('✓ Enviado. Revisa la impresora.');
}

async function cmdSend(args: string[]): Promise<void> {
  const [dest, file] = args;
  if (!dest || !file) {
    logger.error('Uso: node src/cli.ts send <destino> <archivo.bin>');
    process.exitCode = 1;
    return;
  }
  const target = parseTarget(dest);
  const data = new Uint8Array(await readFile(file));
  logger.info(`Enviando ${data.length} bytes a ${formatTarget(target)} ...`);
  await printRaw(target, data);
  logger.info('✓ Enviado.');
}

function printHelp(): void {
  console.log(`
Agente de impresión Leogin — CLI de pruebas

  node src/cli.ts list
      Lista las impresoras instaladas en Windows.

  node src/cli.ts test "<destino>"
      Imprime un ticket de prueba. Destinos válidos:
        windows:NOMBRE        (USB / Bluetooth / red con driver)
        tcp://IP:9100         (impresora de red por IP)

  node src/cli.ts send "<destino>" <archivo.bin>
      Envía bytes crudos desde un archivo (depuración).
`);
}

export async function runCli(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'list': await cmdList(); break;
    case 'test': await cmdTest(rest); break;
    case 'send': await cmdSend(rest); break;
    default: printHelp();
  }
}
