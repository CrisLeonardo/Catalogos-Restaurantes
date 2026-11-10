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

   PERO no promete lo que no logró (auditoría 2026-11-03, ficha 0.11 /
   T02). `saveQueuedOrder` antes se tragaba el fallo: con el
   almacenamiento lleno o bloqueado, la pantalla decía «tu pedido se
   guardó» y el pedido solo vivía en memoria. Ahora devuelve si de verdad
   quedó escrito (y lo comprueba leyéndolo de vuelta), para que quien lo
   llama diga «No se guardó en este aparato» y ofrezca qué hacer.
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

/** Por qué no se pudo guardar: lleno (cuota) o bloqueado (modo privado,
    permisos, sin almacenamiento). Cambia lo que se le dice a la persona. */
export type MotivoNoGuardado = 'lleno' | 'bloqueado';

export type GuardadoEnCola = { ok: true } | { ok: false; motivo: MotivoNoGuardado };

function motivoDelFallo(e: unknown): MotivoNoGuardado {
  const { name, code } = (e ?? {}) as { name?: string; code?: number };
  // Chrome/Safari: QuotaExceededError (código 22); Firefox antiguo: 1014.
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) {
    return 'lleno';
  }
  return 'bloqueado';
}

/**
 * Guarda (o reemplaza, por `clientId`) el pedido en la cola del aparato.
 * `ok: true` solo si al leerla de vuelta el pedido está ahí.
 */
export function saveQueuedOrder(restaurantId: string, order: QueuedOrder, scope: QueueScope = 'customer'): GuardadoEnCola {
  try {
    const list = [
      order,
      ...getQueuedOrders(restaurantId, scope).filter((o) => o.clientId !== order.clientId),
    ];
    localStorage.setItem(queueKey(restaurantId, scope), JSON.stringify(list));
    const quedo = getQueuedOrders(restaurantId, scope).some((o) => o.clientId === order.clientId);
    return quedo ? { ok: true } : { ok: false, motivo: 'bloqueado' };
  } catch (e) {
    return { ok: false, motivo: motivoDelFallo(e) };
  }
}

/** La causa, dicha para quien la lee (comensal o mesero). */
export function causaNoGuardado(motivo: MotivoNoGuardado): string {
  return motivo === 'lleno'
    ? 'la memoria del navegador está llena'
    : 'este navegador no deja guardar datos (modo privado o permisos)';
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
