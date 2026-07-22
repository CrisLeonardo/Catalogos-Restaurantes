/* Dividir cuenta entre comensales de una misma mesa (Fase 1 auditoría de
   lanzamiento). Cálculo puro, sin persistencia: no existe en este proyecto
   un sistema de cobro por persona (el cobro sigue siendo manual, ver
   PLAN_AUDITORIA_LANZAMIENTO.md Fase 0) — esta pantalla solo le dice al
   mesero cuánto le toca a cada quien.

   Reparto por ítem: cada línea de pedido se asigna a 1+ comensales (por
   defecto TODOS, lo que implementa "partes iguales" sin que el mesero
   tenga que tocar nada); si se desmarca a alguien de un ítem puntual, ese
   ítem se reparte solo entre quienes queden asignados. Los "extras" de
   cada pedido (propina, envío, descuento, puntos canjeados — lo que sea
   que separe order.total de la suma de sus ítems) siempre se reparten en
   partes iguales entre TODOS los comensales de la mesa, sin importar la
   asignación de ítems: no hay forma de saber a cuál comensal "pertenece"
   la propina o un cupón aplicado a la mesa completa. */

import type { OrderItem } from '@/types';
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';

/** itemId -> ids de comensales que lo comparten. Ausente/[] = todos (default). */
export type BillAssignment = Record<string, string[]>;

export interface ComensalTotal {
  comensalId: string;
  total: number;
}

/**
 * Reparte el total real de todos los `orders` (ya filtrados a los activos de
 * la mesa) entre `comensalIds`. El último comensal absorbe el remanente de
 * redondeo para que la suma cuadre EXACTO con la suma de order.total.
 */
export function computeComensalTotals(
  orders: OrderWithItems[],
  comensalIds: string[],
  assignment: BillAssignment,
): ComensalTotal[] {
  const raw = new Map<string, number>(comensalIds.map((c) => [c, 0]));
  if (comensalIds.length === 0) return [];

  for (const order of orders) {
    let itemsSum = 0;
    for (const item of order.items) {
      const qty = remainingQuantity(item, order.voids ?? []);
      if (qty === 0) continue;
      const unitPrice = itemUnitPrice(item);
      const lineTotal = unitPrice * qty;
      itemsSum += lineTotal;

      const sharedWith = assignment[item.id]?.length ? assignment[item.id] : comensalIds;
      const share = lineTotal / sharedWith.length;
      for (const cid of sharedWith) {
        if (raw.has(cid)) raw.set(cid, (raw.get(cid) ?? 0) + share);
      }
    }

    // Todo lo que no son ítems (propina, envío, descuento, puntos…), en
    // partes iguales entre todos — se calcula por diferencia para no tener
    // que replicar la fórmula exacta de cada tipo de pedido (ver createOrder
    // vs createWaiterOrder: no siempre suman los mismos componentes).
    const extras = Number(order.total) - itemsSum;
    const perComensalExtra = extras / comensalIds.length;
    comensalIds.forEach((cid) => raw.set(cid, (raw.get(cid) ?? 0) + perComensalExtra));
  }

  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  let assigned = 0;
  const result: ComensalTotal[] = comensalIds.map((cid, i) => {
    if (i === comensalIds.length - 1) {
      return { comensalId: cid, total: round2(grandTotal - assigned) };
    }
    const r = round2(raw.get(cid) ?? 0);
    assigned += r;
    return { comensalId: cid, total: r };
  });
  return result;
}

function itemUnitPrice(item: OrderItem): number {
  return item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
