/* ============================================================
   COLA LOCAL DE PEDIDOS PENDIENTES (Fase 1 — offline/mala señal)
   ------------------------------------------------------------
   Cuando el checkout no logra hablarle al servidor (sin conexión o la
   llamada falla a nivel de red), el pedido se guarda aquí con su
   `clientId` estable en vez de perderse. checkout-form.tsx reintenta
   enviarlo (evento 'online' + temporizador de respaldo) usando el MISMO
   clientId — el servidor (ver migración 061 y `createOrder`) es
   idempotente por ese id, así que reintentar nunca duplica el pedido.
   Igual que customer-local.ts: tolerante a fallos, nunca rompe si
   localStorage no existe.
   ============================================================ */

export interface QueuedOrder {
  clientId: string;
  /** El mismo objeto que checkout-form arma para `createOrder` (sin parsear). */
  payload: unknown;
  queuedAt: string; // ISO
  /** Total del pedido — solo para mostrarlo en "Mis pedidos" si se confirma en background. */
  total?: number;
}

/** 'waiter' usa una clave de localStorage separada de 'customer' — el panel
    de mesero vive en el mismo origen que el catálogo (mismo subdominio), así
    que sin esto su cola podría chocar con la del comensal en un dispositivo
    que usara ambos. */
type QueueScope = 'customer' | 'waiter';

const queueKey = (restaurantId: string, scope: QueueScope) =>
  scope === 'waiter' ? `waiter-order-queue-${restaurantId}` : `order-queue-${restaurantId}`;

export function getQueuedOrders(restaurantId: string, scope: QueueScope = 'customer'): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(queueKey(restaurantId, scope));
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return (list as Partial<QueuedOrder>[]).filter(
      (o) => typeof o?.clientId === 'string' && o.payload !== undefined,
    ) as QueuedOrder[];
  } catch {
    return [];
  }
}

export function saveQueuedOrder(restaurantId: string, order: QueuedOrder, scope: QueueScope = 'customer'): void {
  try {
    const list = [
      order,
      ...getQueuedOrders(restaurantId, scope).filter((o) => o.clientId !== order.clientId),
    ];
    localStorage.setItem(queueKey(restaurantId, scope), JSON.stringify(list));
  } catch {}
}

export function removeQueuedOrder(restaurantId: string, clientId: string, scope: QueueScope = 'customer'): void {
  try {
    const list = getQueuedOrders(restaurantId, scope).filter((o) => o.clientId !== clientId);
    if (list.length > 0) {
      localStorage.setItem(queueKey(restaurantId, scope), JSON.stringify(list));
    } else {
      localStorage.removeItem(queueKey(restaurantId, scope));
    }
  } catch {}
}
