/**
 * Cómo se pagó un pedido.
 *
 * Existía como cadena suelta repartida por medio proyecto: el checkout
 * público mandaba 'CASH' | 'CARD', el pedido de mesero escribía 'CASH' a
 * mano SIEMPRE (pagara como pagara la mesa), el ticket comparaba
 * `=== 'CARD'` y el arqueo de caja sumaba como efectivo todo lo que no
 * dijera otra cosa. El resultado era una caja que salía corta cada noche
 * que alguien pagara con tarjeta en una mesa, sin nada que lo explicara.
 *
 * Aquí vive el vocabulario único: los códigos que se guardan en
 * `orders.payment_method`, cómo se llaman en pantalla y cómo se lee
 * cualquier cosa que ya estuviera guardada.
 *
 * La columna es `text` sin restricción a propósito —hay pedidos viejos y
 * pedidos de canales externos con valores propios—, así que `normalize`
 * nunca inventa: lo que no reconoce se queda como está, en mayúsculas, y
 * `labelOf` lo enseña tal cual en vez de mentir diciendo "Efectivo".
 */

/** Los métodos que la aplicación sabe cobrar. */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Cómo se llama cada uno en pantalla, en el ticket y en el arqueo. */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

/** Solo el efectivo tiene que estar en el cajón al cerrar. */
export function countsAsCash(method: string | null | undefined): boolean {
  return normalize(method) === 'CASH';
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Lo guardado → un código en mayúsculas. Vacío o nulo = efectivo (el
    valor por omisión de la columna desde siempre). */
export function normalize(method: string | null | undefined): string {
  const v = (method ?? '').trim().toUpperCase();
  return v || 'CASH';
}

/** El nombre de un método guardado. Lo desconocido se enseña tal cual:
    un pedido de un canal externo con su propia forma de pago dice la
    suya y no se disfraza de efectivo. */
export function labelOf(method: string | null | undefined): string {
  const v = normalize(method);
  return isPaymentMethod(v) ? PAYMENT_LABEL[v] : v;
}
