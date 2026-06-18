// Detecta las impresoras instaladas en Windows (vía list-printers.ps1).

import type { DiscoveredPrinter } from './types.ts';
import { runPsFile } from './ps.ts';

interface RawPrinter {
  Name?: string;
  DriverName?: string;
  PortName?: string;
  Shared?: boolean;
  Type?: string;
  PrinterStatus?: string;
}

export async function discoverPrinters(): Promise<DiscoveredPrinter[]> {
  const raw = await runPsFile('list-printers.ps1');
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const arr: RawPrinter[] = Array.isArray(parsed) ? parsed : [parsed as RawPrinter];

  return arr
    .filter((p) => typeof p.Name === 'string' && p.Name.length > 0)
    .map((p) => ({
      name: p.Name as string,
      driver: p.DriverName || undefined,
      port: p.PortName || undefined,
      shared: typeof p.Shared === 'boolean' ? p.Shared : undefined,
      type: p.Type || undefined,
      status: p.PrinterStatus || undefined,
      target: `windows:${p.Name}`,
    }));
}
