// Capa de impresión — dos niveles con detección automática:
//   1. Web USB   → silencioso, impresoras USB, Chrome/Edge (sin instalar nada extra)
//   2. Fallback  → window.print() con diálogo del navegador
//
// (El Agente Leogin instalado en la PC del local es la vía recomendada y
// vive aparte en @/lib/print-agent; esta capa es lo que usa el navegador
// cuando el local no tiene Agente.)
//
// Toda la configuración es POR DISPOSITIVO (localStorage).

export type PrintRole = 'kitchen' | 'receipt';

export const PRINT_KEYS = {
  kitchenEnabled: 'leogin_kitchen_print_enabled',
} as const;

function store(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

export function isKitchenAutoPrintEnabled(): boolean {
  return store()?.getItem(PRINT_KEYS.kitchenEnabled) === '1';
}

export function setKitchenAutoPrintEnabled(on: boolean): void {
  store()?.setItem(PRINT_KEYS.kitchenEnabled, on ? '1' : '0');
}

/** ¿Este dispositivo tiene REALMENTE a dónde imprimir este rol?
 *
 *  Importa para la impresión automática: sin impresora asignada, printTicket
 *  cae al último recurso, que es abrir una ventana del navegador con el
 *  diálogo de imprimir. Como acción manual tiene sentido; disparada sola por
 *  cada pedido que entra a cocina, sería una ventana emergente tras otra toda
 *  la noche. Con esta comprobación, un dispositivo sin impresora simplemente
 *  no participa. */
export function hasPrinterConfigured(role: PrintRole): boolean {
  return !!getUsbPrinterInfo(role);
}

/* ── Comandas ya impresas POR ESTE DISPOSITIVO ────────────────────────────
   Cuando el local imprime por el navegador (Web USB) en vez de con el Agente,
   el candado del servidor no sirve: ahí no hay cola de trabajos que consultar.
   El registro es local porque el hecho que describe también lo es —"de esta
   computadora ya salió este papel"— y sobrevive a recargas de la página, que
   es cuando antes se repetía la comanda. */

const KITCHEN_PRINTED_KEY = 'leogin_kitchen_printed_v1';
const KITCHEN_PRINTED_MAX = 300;

function readPrintedIds(): string[] {
  try {
    const raw = store()?.getItem(KITCHEN_PRINTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function wasKitchenPrinted(orderId: string): boolean {
  return readPrintedIds().includes(orderId);
}

/** Marca la comanda como impresa aquí. Devuelve false si ya lo estaba —
 *  úsalo como candado: `if (!markKitchenPrinted(id)) return;`. */
export function markKitchenPrinted(orderId: string): boolean {
  const s = store();
  if (!s) return true;
  const ids = readPrintedIds();
  if (ids.includes(orderId)) return false;
  ids.push(orderId);
  try {
    s.setItem(KITCHEN_PRINTED_KEY, JSON.stringify(ids.slice(-KITCHEN_PRINTED_MAX)));
  } catch { /* almacenamiento lleno o bloqueado: peor sería no imprimir */ }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nivel 1: Web USB (ESC/POS)
// ─────────────────────────────────────────────────────────────────────────────

export interface UsbPrinterInfo {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  productName?: string;
}

const USB_KEYS: Record<PrintRole, string> = {
  kitchen: 'leogin_usb_kitchen',
  receipt: 'leogin_usb_receipt',
};

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export function getUsbPrinterInfo(role: PrintRole): UsbPrinterInfo | null {
  const raw = store()?.getItem(USB_KEYS[role]);
  if (!raw) return null;
  try { return JSON.parse(raw) as UsbPrinterInfo; } catch { return null; }
}

function saveUsbPrinterInfo(role: PrintRole, info: UsbPrinterInfo): void {
  store()?.setItem(USB_KEYS[role], JSON.stringify(info));
}

export function clearUsbPrinter(role: PrintRole): void {
  store()?.removeItem(USB_KEYS[role]);
}

/** Muestra el selector de dispositivos USB (requiere gesto del usuario). */
export async function requestUsbPrinter(role: PrintRole): Promise<UsbPrinterInfo | null> {
  if (!isWebUsbSupported()) return null;
  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
    const info: UsbPrinterInfo = {
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber ?? undefined,
      productName: device.productName ?? undefined,
    };
    saveUsbPrinterInfo(role, info);
    return info;
  } catch (e) {
    // El usuario canceló el selector
    if ((e as DOMException)?.name === 'NotFoundError') return null;
    throw e;
  }
}

function findBulkOutEndpoint(
  device: USBDevice,
): { interfaceNum: number; endpointNum: number } | null {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'out' && ep.type === 'bulk') {
            return { interfaceNum: iface.interfaceNumber, endpointNum: ep.endpointNumber };
          }
        }
      }
    }
  }
  return null;
}

async function findAuthorizedDevice(info: UsbPrinterInfo): Promise<USBDevice | null> {
  const devices = await navigator.usb.getDevices();
  return (
    devices.find(
      (d) =>
        d.vendorId === info.vendorId &&
        d.productId === info.productId &&
        (!info.serialNumber || d.serialNumber === info.serialNumber),
    ) ?? null
  );
}

/** Envía bytes ESC/POS directamente a la impresora USB configurada para el rol. */
export async function printEscPosViaUsb(role: PrintRole, data: Uint8Array): Promise<boolean> {
  if (!isWebUsbSupported()) return false;
  const info = getUsbPrinterInfo(role);
  if (!info) return false;

  let device: USBDevice | null = null;
  try {
    device = await findAuthorizedDevice(info);
    if (!device) return false;

    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);

    const ep = findBulkOutEndpoint(device);
    if (!ep) throw new Error('No se encontró endpoint bulk-out');

    await device.claimInterface(ep.interfaceNum);
    await device.transferOut(ep.endpointNum, data);
    return true;
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    // El controlador de Windows puede bloquear la interfaz — error esperado
    if (msg.includes('Unable to claim') || msg.includes('Access denied')) {
      console.warn('[USB] Interfaz ocupada (driver de Windows). Intenta con el Agente Leogin.');
    } else {
      console.warn('[USB] Error al imprimir:', msg);
    }
    return false;
  } finally {
    try { await device?.close(); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nivel 2: Fallback — diálogo del navegador
// ─────────────────────────────────────────────────────────────────────────────

function printHtmlViaBrowser(html: string): void {
  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) {
    alert('Permite ventanas emergentes para imprimir.');
    return;
  }
  const withAutoPrint = html.includes('__leogin_autoprint__')
    ? html
    : html.replace(
        '</body>',
        '<script>/*__leogin_autoprint__*/window.onload=function(){window.print();};<\/script></body>',
      );
  win.document.write(withAutoPrint);
  win.document.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal de impresión
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintResult {
  method: 'usb' | 'browser';
  ok: boolean;
  error?: string;
}

/**
 * Imprime un ticket para el rol indicado.
 *
 * Orden de intento:
 *   1. Web USB (si hay impresora USB autorizada y se provee escposBuilder)
 *   2. window.print() como último recurso
 *
 * @param role        'kitchen' | 'receipt'
 * @param html        HTML completo del ticket (para el fallback de navegador)
 * @param escposBuilder  función que genera bytes ESC/POS (para Web USB, llamada lazy)
 */
export async function printTicket(
  role: PrintRole,
  html: string,
  escposBuilder?: () => Uint8Array,
): Promise<PrintResult> {
  // ── Nivel 1: Web USB ─────────────────────────────────────────────────────
  if (escposBuilder && isWebUsbSupported() && getUsbPrinterInfo(role)) {
    try {
      const data = escposBuilder();
      const ok = await printEscPosViaUsb(role, data);
      if (ok) return { method: 'usb', ok: true };
    } catch (e) {
      console.warn('[printing] USB falló, usando navegador:', (e as Error)?.message);
    }
  }

  // ── Nivel 3: Diálogo del navegador ───────────────────────────────────────
  printHtmlViaBrowser(html);
  return { method: 'browser', ok: true };
}
