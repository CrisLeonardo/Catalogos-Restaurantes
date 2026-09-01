/* Dividir la cuenta de una mesa entre sus comensales.

   Cálculo puro, sin persistencia: no existe en este proyecto un sistema de
   cobro por persona (el cobro sigue siendo manual) — esto le dice al mesero
   cuánto le toca a cada quien y le imprime el ticket de cada uno.

   Tres formas de repartir, en orden de qué tan seguido pasan en la vida real:

     · 'single'  — una sola cuenta. Nadie divide nada; es el caso más común y
                   ahora es el que arranca por defecto.
     · 'equal'   — partes iguales entre N personas. Solo hace falta el número:
                   ni nombres ni tocar platos.
     · 'byItem'  — cada quien lo suyo, plato por plato.

   OJO con el cambio de contrato respecto a la versión anterior: un ítem sin
   entrada en `BillAssignment` ahora está SIN ASIGNAR, no "es de todos". Antes
   todos los platos empezaban asignados a todo el mundo, así que tocar un plato
   con una persona activa se lo QUITABA en vez de dárselo — exactamente al
   revés del gesto que la pantalla pedía ("toca los platos de esta persona").
   Con el estado "sin asignar" explícito el gesto es directo y, además, lo que
   nadie ha reclamado se ve en su propio renglón en vez de repartirse a
   escondidas y descuadrar el cobro.

   Los "extras" (propina, envío, descuento, puntos canjeados — todo lo que
   separa order.total de la suma de sus ítems) se reparten:
     · en 'equal', en partes iguales;
     · en 'byItem', EN PROPORCIÓN a lo consumido — quien pidió más pone más
       propina y el cupón de la mesa beneficia a cada quien en la misma
       medida. Repartirlos parejo hacía que alguien que solo pidió un café
       pagara la misma propina que el de la parrillada. */

import type { OrderItem, OrderStatus } from '@/types';
import { remainingQuantity, voidedQuantity, type OrderWithItems } from '@/lib/db/orders';

export type SplitMode = 'single' | 'equal' | 'byItem';

/** itemId → ids de comensales que se reparten esa línea.
 *  Ausente o `[]` = SIN ASIGNAR (ver nota de arriba). */
export type BillAssignment = Record<string, string[]>;

/** Id reservado del renglón "sin asignar" — nunca es un comensal real. */
export const UNASSIGNED_ID = '__sin_asignar__';

export interface BillLine {
  itemId: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  name: string;
  /** Opciones elegidas, ya en texto ("Grande, sin cebolla"). null si no tenía. */
  options: string | null;
  /** Unidades en pie tras las anulaciones. 0 = línea anulada por completo. */
  quantity: number;
  voidedQuantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Nota del plato ("sin cilantro"), tal como la escribió el mesero. */
  note: string | null;
  /** Asiento al que se le apuntó (migración 123). null = de la mesa. */
  seat: number | null;
}

export interface BillBreakdown {
  /** Suma de las líneas vivas (consumo puro). */
  items: number;
  tip: number;
  delivery: number;
  /** Cupones + puntos canjeados, en positivo (es un descuento). */
  discount: number;
  /** total − items. Puede ser negativo si los descuentos superan a la propina. */
  extras: number;
  grandTotal: number;
  orderCount: number;
}

export interface PersonShare {
  personId: string;
  /** Consumo asignado a esta persona. */
  items: number;
  /** Su parte de propina/envío/descuentos. */
  extras: number;
  total: number;
}

export interface SplitResult {
  people: PersonShare[];
  /** Solo en 'byItem' y solo si queda algo sin reclamar. */
  unassigned: PersonShare | null;
  breakdown: BillBreakdown;
}

/* ── Lectura de la cuenta ─────────────────────────────────── */

/** Aplana los pedidos de la mesa a líneas de cuenta, en orden de llegada. */
export function buildBillLines(orders: OrderWithItems[]): BillLine[] {
  const lines: BillLine[] = [];
  for (const order of orders) {
    const voids = order.voids ?? [];
    for (const item of order.items) {
      const quantity = remainingQuantity(item, voids);
      const unitPrice = itemUnitPrice(item);
      lines.push({
        itemId: item.id,
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: order.status,
        name: item.name_snapshot,
        options: describeOptions(item),
        quantity,
        voidedQuantity: voidedQuantity(item, voids),
        unitPrice,
        lineTotal: round2(unitPrice * quantity),
        note: item.note ?? null,
        seat: item.seat_no ?? null,
      });
    }
  }
  return lines;
}

export function billBreakdown(orders: OrderWithItems[]): BillBreakdown {
  let items = 0;
  let tip = 0;
  let delivery = 0;
  let discount = 0;
  let grandTotal = 0;

  for (const order of orders) {
    const voids = order.voids ?? [];
    for (const item of order.items) {
      items += itemUnitPrice(item) * remainingQuantity(item, voids);
    }
    tip += Number(order.tip) || 0;
    delivery += Number(order.delivery_fee) || 0;
    discount += (Number(order.discount) || 0) + (Number(order.loyalty_discount) || 0);
    grandTotal += Number(order.total) || 0;
  }

  items = round2(items);
  grandTotal = round2(grandTotal);
  return {
    items,
    tip: round2(tip),
    delivery: round2(delivery),
    discount: round2(discount),
    // Por diferencia a propósito: es la única forma de no tener que replicar
    // la fórmula exacta de cada tipo de pedido (createOrder y
    // createWaiterOrder no suman siempre los mismos componentes) y de que la
    // suma de las partes cuadre SIEMPRE con lo que el pedido cobra.
    extras: round2(grandTotal - items),
    grandTotal,
    orderCount: orders.length,
  };
}

/* ── Reparto ──────────────────────────────────────────────── */

export function computeSplit(input: {
  orders: OrderWithItems[];
  mode: SplitMode;
  peopleIds: string[];
  assignment: BillAssignment;
}): SplitResult {
  const { orders, mode, peopleIds, assignment } = input;
  const breakdown = billBreakdown(orders);

  if (mode === 'single' || peopleIds.length === 0) {
    return {
      people: [{
        personId: peopleIds[0] ?? '1',
        items: breakdown.items,
        extras: breakdown.extras,
        total: breakdown.grandTotal,
      }],
      unassigned: null,
      breakdown,
    };
  }

  if (mode === 'equal') {
    const n = peopleIds.length;
    const rows = peopleIds.map((personId) => ({
      personId,
      items: breakdown.items / n,
      extras: breakdown.extras / n,
      total: breakdown.grandTotal / n,
    }));
    return { people: settle(rows, breakdown.grandTotal), unassigned: null, breakdown };
  }

  // ── byItem ──
  const known = new Set(peopleIds);
  const consumedBy = new Map<string, number>(peopleIds.map((id) => [id, 0]));
  let unassignedItems = 0;

  for (const line of buildBillLines(orders)) {
    if (line.quantity === 0) continue; // anulado entero: no se cobra a nadie
    const claimed = (assignment[line.itemId] ?? []).filter((id) => known.has(id));
    if (claimed.length === 0) {
      unassignedItems += line.lineTotal;
      continue;
    }
    const share = line.lineTotal / claimed.length;
    for (const id of claimed) consumedBy.set(id, (consumedBy.get(id) ?? 0) + share);
  }

  const consumed = breakdown.items;
  // Sin nada consumido (mesa que solo tiene propina/cargos) no hay proporción
  // posible: se reparte parejo para no cargárselo entero al primero.
  const shareOfExtras = (amount: number) =>
    consumed > 0 ? breakdown.extras * (amount / consumed) : breakdown.extras / peopleIds.length;

  const rows: PersonShare[] = peopleIds.map((personId) => {
    const items = consumedBy.get(personId) ?? 0;
    const extras = shareOfExtras(items);
    return { personId, items, extras, total: items + extras };
  });

  if (unassignedItems > 0) {
    const extras = consumed > 0 ? breakdown.extras * (unassignedItems / consumed) : 0;
    rows.push({ personId: UNASSIGNED_ID, items: unassignedItems, extras, total: unassignedItems + extras });
  }

  const settled = settle(rows, breakdown.grandTotal);
  const unassigned = settled.find((r) => r.personId === UNASSIGNED_ID) ?? null;
  return {
    people: settled.filter((r) => r.personId !== UNASSIGNED_ID),
    unassigned,
    breakdown,
  };
}

/** Cuántas líneas vivas no tiene nadie asignadas todavía. */
export function countUnassignedLines(lines: BillLine[], assignment: BillAssignment, peopleIds: string[]): number {
  const known = new Set(peopleIds);
  return lines.filter(
    (l) => l.quantity > 0 && (assignment[l.itemId] ?? []).filter((id) => known.has(id)).length === 0,
  ).length;
}

/* ── Interno ──────────────────────────────────────────────── */

/** Cuadra los centavos para que la suma de las partes dé EXACTO el total de la
 *  mesa. Método del resto mayor: se trunca a centavos y los que sobran se dan
 *  de uno en uno a las partes con la fracción más alta, así nadie queda a más
 *  de un centavo de los demás. (Volcar todo el resto en una sola parte dejaba
 *  cosas como 97.11 / 97.13 / 97.13 / 97.13, que en la mesa parecen un error
 *  de la app.) A igualdad de fracción manda el orden de la lista: mismo
 *  reparto en cada render. */
function settle(rows: PersonShare[], grandTotal: number): PersonShare[] {
  if (rows.length === 0) return [];

  const targetCents = Math.round(grandTotal * 100);
  const rawCents = rows.map((r) => r.total * 100);
  const cents = rawCents.map((v) => Math.floor(v));
  let left = targetCents - cents.reduce((s, v) => s + v, 0);

  const byFraction = rawCents
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < byFraction.length && left > 0; k++, left--) cents[byFraction[k].i] += 1;
  if (left !== 0) cents[0] += left; // red de seguridad: nunca debería quedar resto

  return rows.map((r, i) => {
    const total = cents[i] / 100;
    const items = round2(r.items);
    // extras por diferencia: así items + extras siempre da el total mostrado.
    return { personId: r.personId, items, extras: round2(total - items), total };
  });
}

function itemUnitPrice(item: OrderItem): number {
  // subtotal siempre se guarda como price_snapshot * quantity (ver createOrder
  // y createWaiterOrder), con las opciones ya sumadas al precio unitario.
  return item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
}

function describeOptions(item: OrderItem): string | null {
  const opts = item.options_snapshot ?? [];
  if (opts.length === 0) return null;
  return opts.map((o) => (o.variant ? `${o.choice} (${o.variant})` : o.choice)).join(', ');
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
