/* ============================================================
   PAGA TU PLAN — reglas puras del cobro por transferencia
   ------------------------------------------------------------
   docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (§3).

   Sin base de datos ni sesión: lo usan la pantalla del dueño
   (Mi suscripción), las server actions y la bandeja del super admin,
   y así se prueba sin levantar nada.
   ============================================================ */

/** Tipos de archivo que se aceptan como comprobante → extensión en el bucket. */
export const COMPROBANTE_TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Igual que el límite del bucket `payment-proofs` (migración 148). */
export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024;

export type EstadoComprobante = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

/**
 * Código que el dueño escribe en la descripción de su transferencia para
 * que Leogin sepa de quién es sin adivinar por el nombre del titular.
 * Fijo por restaurante (no por factura): se lo aprende una vez y lo usa
 * todos los meses. Seis caracteres del id bastan para distinguir a los
 * restaurantes de una sola plataforma y caben en cualquier banca en línea.
 */
export function codigoDePago(restaurantId: string): string {
  const limpio = restaurantId.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase();
  return `LG-${limpio}`;
}

/** ¿La ruta del archivo pertenece a este restaurante y tiene forma válida?
 *  Cierra la puerta a que alguien registre como suyo un archivo ajeno. */
export function rutaDeComprobanteValida(restaurantId: string, ruta: string): boolean {
  const exts = Object.values(COMPROBANTE_TIPOS).join('|');
  const re = new RegExp(`^${restaurantId}/[0-9a-f-]{36}\\.(${exts})$`, 'i');
  return re.test(ruta);
}

/** Número de boleta o referencia del banco: opcional, corto y sin rarezas. */
export function limpiarReferencia(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').replace(/[^\p{L}\p{N}\s\-#/.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return t || null;
}

export interface DatosBancarios {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
}

/** ¿Hay datos suficientes para pintar la cuenta con su botón de copiar? */
export function hayCuenta(d: DatosBancarios): boolean {
  return d.banco.trim() !== '' && d.numeroCuenta.trim() !== '';
}
