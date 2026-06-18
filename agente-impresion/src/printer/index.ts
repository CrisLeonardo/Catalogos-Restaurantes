// Punto único de impresión: parsea un destino y despacha al transporte correcto.

import type { PrintTarget } from './types.ts';
import { sendTcp } from './tcp.ts';
import { sendWindowsRaw } from './windowsRaw.ts';
import { previewEscPos } from './preview.ts';
import { printDocToWindows } from './doc.ts';

export type { PrintTarget } from './types.ts';
export { discoverPrinters } from './discover.ts';

/**
 * Convierte una cadena de destino en un PrintTarget.
 *   "windows:EPSON TM-T20"   → spooler de Windows (USB / BT / red-con-driver)
 *   "tcp://192.168.1.50:9100" → TCP directo (red por IP)
 *   "tcp://192.168.1.50"      → TCP, puerto 9100 por defecto
 */
export function parseTarget(input: string): PrintTarget {
  const v = input.trim();

  if (v.startsWith('tcp://')) {
    const rest = v.slice('tcp://'.length);
    const idx = rest.lastIndexOf(':');
    const host = idx === -1 ? rest : rest.slice(0, idx);
    const portStr = idx === -1 ? '' : rest.slice(idx + 1);
    if (!host) throw new Error(`Destino TCP inválido: "${input}"`);
    const port = portStr ? Number(portStr) : 9100;
    if (!Number.isInteger(port) || port <= 0) throw new Error(`Puerto inválido en "${input}"`);
    return { kind: 'tcp', host, port };
  }

  if (v === 'preview' || v === 'preview:') {
    return { kind: 'preview' };
  }

  if (v.startsWith('doc:')) {
    const name = v.slice('doc:'.length).trim();
    if (!name) throw new Error(`Falta el nombre de la impresora en "${input}"`);
    return { kind: 'doc', name };
  }

  if (v.startsWith('windows:') || v.startsWith('win:')) {
    const name = v.slice(v.indexOf(':') + 1).trim();
    if (!name) throw new Error(`Falta el nombre de la impresora en "${input}"`);
    return { kind: 'windows', name };
  }

  throw new Error(
    `Destino no reconocido: "${input}". Usa "windows:NOMBRE", "tcp://IP:9100", "preview:" o "doc:NOMBRE".`,
  );
}

export function formatTarget(t: PrintTarget): string {
  switch (t.kind) {
    case 'windows': return `windows:${t.name}`;
    case 'tcp': return `tcp://${t.host}:${t.port}`;
    case 'doc': return `doc:${t.name}`;
    case 'preview': return 'preview:';
  }
}

/** Envía bytes crudos (ESC/POS) al destino. */
export async function printRaw(target: PrintTarget, data: Uint8Array): Promise<void> {
  switch (target.kind) {
    case 'tcp': return sendTcp(target.host, target.port, data);
    case 'windows': return sendWindowsRaw(target.name, data);
    case 'doc': return printDocToWindows(target.name, data);
    case 'preview': return previewEscPos(data);
  }
}
