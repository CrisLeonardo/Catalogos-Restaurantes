// Tipos del subsistema de impresión.

/** Destino de impresión. */
export type PrintTarget =
  | { kind: 'windows'; name: string }   // spooler RAW (USB / BT / red-con-driver)
  | { kind: 'tcp'; host: string; port: number } // TCP directo (red por IP)
  | { kind: 'preview' }                 // simulador en pantalla (desarrollo)
  | { kind: 'doc'; name: string };      // documento normal a una impresora (ej. probar con inyección)

/** Impresora detectada en el sistema, lista para mostrarse y elegirse en el panel. */
export interface DiscoveredPrinter {
  name: string;
  driver?: string;
  port?: string;
  shared?: boolean;
  type?: string;
  status?: string;
  /** Cadena de destino que el agente usaría para imprimir aquí (ej. "windows:EPSON TM-T20"). */
  target: string;
}
