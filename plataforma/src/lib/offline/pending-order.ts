'use client';

/* ============================================================
   Pedido del COMENSAL pendiente por falta de señal (Fase 1).
   ------------------------------------------------------------
   A diferencia del mesero (cola multi-pedido en IndexedDB), el
   comensal tiene a lo sumo UN pedido listo por restaurante; se
   persiste en localStorage para sobrevivir un reload y se
   reintenta desde el checkout. TTL de 10 minutos: pasado ese
   tiempo NO se auto-envía (nadie quiere que el almuerzo pedido
   a la 1 pm entre solo a las 7 pm) — se pide confirmación.
   ============================================================ */

/** Todo lo necesario para reintentar el envío Y pintar la pantalla de éxito. */
export interface PendingOrderBundle {
  clientId: string;
  /** Input completo de createOrder (incluye clientId). */
  payload: unknown;
  createdAt: number;
  // Snapshots para la pantalla de confirmación (solo datos planos).
  itemsSnapshot: { name: string; opts: string; qty: number; sub: number }[];
  feeSnapshot: number;
  tipSnapshot: number;
  totalSnapshot: number;
  discount: number;
  loyaltyDiscount: number;
  payment: string;
  cashAmount: number;
  orderType: string;
  // Perfil a guardar localmente al confirmar.
  name: string;
  phone: string;
  address: string;
  zone: string;
  lat?: number;
  lng?: number;
}

/** Ventana de reenvío automático. Después, confirmación manual. */
export const PENDING_ORDER_TTL_MS = 10 * 60_000;

const key = (restaurantId: string) => `pending-order-${restaurantId}`;

export function savePendingOrder(restaurantId: string, bundle: PendingOrderBundle): void {
  try { localStorage.setItem(key(restaurantId), JSON.stringify(bundle)); } catch { /* best-effort */ }
}

export function loadPendingOrder(restaurantId: string): PendingOrderBundle | null {
  try {
    const raw = localStorage.getItem(key(restaurantId));
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<PendingOrderBundle>;
    if (!b || typeof b.clientId !== 'string' || !b.payload || typeof b.createdAt !== 'number') return null;
    // Pedidos de hace más de 2 h: basura, ni preguntar.
    if (Date.now() - b.createdAt > 2 * 60 * 60_000) {
      clearPendingOrder(restaurantId);
      return null;
    }
    return b as PendingOrderBundle;
  } catch {
    return null;
  }
}

export function clearPendingOrder(restaurantId: string): void {
  try { localStorage.removeItem(key(restaurantId)); } catch { /* best-effort */ }
}
