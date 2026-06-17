// Capa de impresión.
//
// Estrategia de dos niveles con detección automática de capacidad:
//   1. QZ Tray (agente de escritorio Windows/Mac/Linux) → impresión SILENCIOSA
//      a una impresora elegida por nombre. Permite mandar la comanda a la
//      térmica de cocina y el recibo a otra impresora distinta, configurado
//      una sola vez por dispositivo.
//   2. Fallback `window.print()` → cuando no hay QZ (móvil, o PC sin el agente).
//      Sale el diálogo del sistema y va a la impresora predeterminada.
//
// Toda la configuración es POR DISPOSITIVO (localStorage), porque las
// impresoras pertenecen al equipo físico, no a la cuenta del restaurante.

export type PrintRole = 'kitchen' | 'receipt';

export const PRINT_KEYS = {
  /** Compat con la versión anterior: activa la comanda automática al confirmar. */
  kitchenEnabled: 'leogin_kitchen_print_enabled',
  kitchenPrinter: 'leogin_print_kitchen_printer',
  receiptPrinter: 'leogin_print_receipt_printer',
} as const;

function store(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function printerKey(role: PrintRole): string {
  return role === 'kitchen' ? PRINT_KEYS.kitchenPrinter : PRINT_KEYS.receiptPrinter;
}

export function getPrinter(role: PrintRole): string {
  return store()?.getItem(printerKey(role)) ?? '';
}

export function setPrinter(role: PrintRole, name: string): void {
  const s = store();
  if (!s) return;
  if (name) s.setItem(printerKey(role), name);
  else s.removeItem(printerKey(role));
}

export function isKitchenAutoPrintEnabled(): boolean {
  return store()?.getItem(PRINT_KEYS.kitchenEnabled) === '1';
}

export function setKitchenAutoPrintEnabled(on: boolean): void {
  store()?.setItem(PRINT_KEYS.kitchenEnabled, on ? '1' : '0');
}

// ─────────────────────────────────────────────────────────────────────────
// QZ Tray
// ─────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type QZ = any;

let qzPromise: Promise<QZ> | null = null;
let securityConfigured = false;

/** Carga perezosa del módulo (solo en cliente, fuera de SSR). */
async function loadQz(): Promise<QZ> {
  if (!qzPromise) {
    qzPromise = import('qz-tray').then((m: any) => m.default ?? m);
  }
  return qzPromise;
}

/**
 * Configura la firma para que QZ no muestre avisos por acción.
 * Si no hay certificado, se omite y QZ opera en modo sin firma (pide permiso
 * la primera vez por sesión). La clave privada nunca llega al cliente: se firma
 * en /api/print/sign.
 */
async function configureSecurity(qz: QZ): Promise<void> {
  if (securityConfigured) return;
  securityConfigured = true;

  const { QZ_CERTIFICATE } = await import('./qz-cert');
  if (!QZ_CERTIFICATE || !QZ_CERTIFICATE.includes('BEGIN CERTIFICATE')) return;

  qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(QZ_CERTIFICATE));
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) =>
    async (resolve: (v: string) => void, reject: (e: unknown) => void) => {
      try {
        const res = await fetch('/api/print/sign', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: toSign,
        });
        if (!res.ok) throw new Error(`sign ${res.status}`);
        resolve(await res.text());
      } catch (e) {
        reject(e);
      }
    },
  );
}

/** Conecta al agente QZ si no hay sesión activa. Lanza si no está disponible. */
export async function connectQz(): Promise<QZ> {
  const qz = await loadQz();
  await configureSecurity(qz);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  return qz;
}

/** ¿Está QZ Tray corriendo y alcanzable en este equipo? No lanza. */
export async function isQzAvailable(): Promise<boolean> {
  try {
    const qz = await loadQz();
    if (qz.websocket.isActive()) return true;
    await configureSecurity(qz);
    await qz.websocket.connect();
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

/** Lista los nombres de impresoras instaladas en el equipo. */
export async function listPrinters(): Promise<string[]> {
  const qz = await connectQz();
  const found = await qz.printers.find();
  if (Array.isArray(found)) return found;
  return found ? [found] : [];
}

/** Impresora predeterminada del sistema, o null. */
export async function getDefaultPrinter(): Promise<string | null> {
  try {
    const qz = await connectQz();
    return (await qz.printers.getDefault()) ?? null;
  } catch {
    return null;
  }
}

async function printHtmlViaQz(printerName: string, html: string): Promise<void> {
  const qz = await connectQz();
  const config = qz.configs.create(printerName, {
    size: { width: 80, height: null, units: 'mm' }, // ticket térmico 80 mm
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    units: 'mm',
  });
  const data = [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }];
  await qz.print(config, data);
}

function printHtmlViaBrowser(html: string): void {
  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) {
    alert('Permite ventanas emergentes para imprimir.');
    return;
  }
  // El HTML que generamos viene sin auto-impresión (QZ no la necesita);
  // aquí inyectamos el disparo de window.print() para el diálogo del sistema.
  const withAutoPrint = html.includes('__leogin_autoprint__')
    ? html
    : html.replace(
        '</body>',
        '<script>/*__leogin_autoprint__*/window.onload=function(){window.print();};<\/script></body>',
      );
  win.document.write(withAutoPrint);
  win.document.close();
}

export interface PrintResult {
  method: 'qz' | 'browser';
  ok: boolean;
  error?: string;
}

/**
 * Imprime un ticket en el rol indicado.
 * Usa QZ silencioso si hay impresora configurada para el rol y el agente está
 * disponible; si no, cae al diálogo del navegador.
 */
export async function printTicket(role: PrintRole, html: string): Promise<PrintResult> {
  const printer = getPrinter(role);
  if (printer) {
    try {
      if (await isQzAvailable()) {
        await printHtmlViaQz(printer, html);
        return { method: 'qz', ok: true };
      }
    } catch (e) {
      // Si QZ falla a mitad, no perdemos el ticket: caemos al navegador.
      console.warn('[printing] QZ falló, usando navegador:', (e as Error)?.message);
    }
  }
  printHtmlViaBrowser(html);
  return { method: 'browser', ok: true };
}
