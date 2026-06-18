// Transporte "documento": imprime el ticket decodificado como documento normal
// (fuente monoespaciada) a través del driver de una impresora cualquiera —
// p.ej. una inyección como la L3250. Sirve para validar el flujo en PAPEL
// FÍSICO sin tener una impresora térmica. La alineación de columnas se respeta
// gracias a la fuente monoespaciada (ver print-doc.ps1).

import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPsFile } from './ps.ts';
import { decodeEscPos } from './preview.ts';

export async function printDocToWindows(printerName: string, data: Uint8Array): Promise<void> {
  // Líneas decodificadas SIN el marco del simulador (un ticket plano).
  const text = decodeEscPos(data).join('\r\n');
  const dir = await mkdtemp(join(tmpdir(), 'leogin-doc-'));
  const file = join(dir, 'ticket.txt');
  await writeFile(file, text, 'utf8');
  try {
    await runPsFile('print-doc.ps1', ['-PrinterName', printerName, '-FilePath', file]);
  } finally {
    void unlink(file).catch(() => {});
  }
}
