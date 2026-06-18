// Transporte spooler de Windows (RAW vía winspool.drv).
// Cubre USB, Bluetooth emparejada y red-con-driver: todo lo de Get-Printer.

import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPsFile } from './ps.ts';

export async function sendWindowsRaw(printerName: string, data: Uint8Array): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'leogin-print-'));
  const filePath = join(dir, 'job.bin');
  await writeFile(filePath, Buffer.from(data));
  try {
    await runPsFile('raw-print.ps1', ['-PrinterName', printerName, '-FilePath', filePath]);
  } finally {
    void unlink(filePath).catch(() => {});
  }
}
