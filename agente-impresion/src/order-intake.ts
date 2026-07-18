// Acepta un pedido tomado sin conexión: valida contra el snapshot local del
// menú (nunca confía en el precio que manda el cliente), lo encola para
// sincronizar después, e imprime la comanda de cocina al instante.
//
// El payload que llega acá tiene la misma forma que checkout-form.tsx arma
// para createOrder (ver plataforma/src/lib/schemas.ts:createOrderSchema) —
// así el cliente no necesita casos especiales para hablarle al hub o a la
// nube.

import { getMenuSnapshot, getPendingOrders, enqueuePendingOrder, type MenuProduct, type PendingOrder } from './store.ts';
import { buildLocalKitchenTicket, type LocalKitchenItem } from './escpos.ts';
import { parseTarget, printRaw } from './printer/index.ts';
import { logger } from './logger.ts';

interface RawOptionPick { groupId?: unknown; choiceId?: unknown }
interface RawItem {
  productId?: unknown;
  name?: unknown;
  price?: unknown;
  quantity?: unknown;
  options?: unknown;
}
interface RawCustomer {
  name?: unknown;
  phone?: unknown;
  type?: unknown;
  address?: unknown;
  zone?: unknown;
  notes?: unknown;
  tableNumber?: unknown;
  coursePreference?: unknown;
}

export type OrderIntakeResult =
  | { ok: true; orderId: string; orderNumber: string; total: number }
  | { ok: false; error: string; status: number };

/** Resuelve el precio de un ítem contra el producto del snapshot (autoritativo). */
function priceItem(product: MenuProduct, picks: RawOptionPick[]): number {
  let delta = 0;
  const groups = Array.isArray(product.options) ? (product.options as {
    id: string; choices?: { id: string; priceDelta?: number }[];
  }[]) : [];
  for (const pick of picks) {
    if (typeof pick.groupId !== 'string' || typeof pick.choiceId !== 'string') continue;
    const group = groups.find((g) => g.id === pick.groupId);
    const choice = group?.choices?.find((c) => c.id === pick.choiceId);
    if (choice) delta += Number(choice.priceDelta) || 0;
  }
  return Number(product.price) + delta;
}

function optionLabels(product: MenuProduct, picks: RawOptionPick[]): string[] {
  const groups = Array.isArray(product.options) ? (product.options as {
    id: string; choices?: { id: string; name?: string }[];
  }[]) : [];
  const labels: string[] = [];
  for (const pick of picks) {
    if (typeof pick.groupId !== 'string' || typeof pick.choiceId !== 'string') continue;
    const group = groups.find((g) => g.id === pick.groupId);
    const choice = group?.choices?.find((c) => c.id === pick.choiceId);
    if (choice?.name) labels.push(choice.name);
  }
  return labels;
}

/** Número local distinguible de la numeración de la nube (ORD-YYYY-NNNNN). */
function localOrderNumber(): string {
  return `L-${Date.now().toString(36).toUpperCase()}`;
}

export async function acceptOfflineOrder(rawBody: unknown): Promise<OrderIntakeResult> {
  const snapshot = getMenuSnapshot();
  if (!snapshot) {
    return { ok: false, status: 503, error: 'El hub todavía no tiene un menú cacheado — espera a que sincronice con conexión.' };
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const clientId = body.clientId;
  const items = body.items;
  const customer = (body.customer ?? {}) as RawCustomer;

  if (typeof clientId !== 'string' || !clientId) {
    return { ok: false, status: 400, error: 'Falta clientId.' };
  }
  // Idempotencia TAMBIÉN para la impresión: la cola ya deduplicaba por
  // clientId, pero la comanda se imprimía en CADA reintento (WiFi inestable
  // → respuesta perdida → el navegador reenvía el mismo pedido → ticket
  // duplicado en cocina). Si ya lo tenemos, se reconfirma sin imprimir.
  const existing = getPendingOrders().find((o) => o.clientId === clientId);
  if (existing) {
    return {
      ok: true,
      orderId: clientId,
      orderNumber: existing.orderNumber,
      total: existing.display?.total ?? 0,
    };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, error: 'El carrito está vacío.' };
  }
  if (typeof customer.name !== 'string' || !customer.name.trim()) {
    return { ok: false, status: 400, error: 'Falta el nombre del cliente.' };
  }
  const orderType = customer.type === 'PICKUP' || customer.type === 'DELIVERY' || customer.type === 'DINE_IN'
    ? customer.type : null;
  if (!orderType) {
    return { ok: false, status: 400, error: 'Tipo de pedido inválido.' };
  }

  const productById = new Map(snapshot.products.map((p) => [p.id, p]));
  const verified: { name: string; quantity: number; price: number; options: string[] }[] = [];

  for (const raw of items as RawItem[]) {
    // Misma forma mínima que exige createOrderSchema en la nube (name y price
    // incluidos, aunque el precio real se resuelve del snapshot): si el hub
    // aceptara un ítem que la nube va a rechazar, el pedido quedaría marcado
    // como fallido al sincronizar en vez de rechazarse aquí, de frente.
    if (
      typeof raw.productId !== 'string' ||
      typeof raw.quantity !== 'number' || raw.quantity <= 0 ||
      typeof raw.name !== 'string' || !raw.name.trim() ||
      typeof raw.price !== 'number' || raw.price <= 0
    ) {
      return { ok: false, status: 400, error: 'Ítem inválido en el carrito.' };
    }
    const product = productById.get(raw.productId);
    if (!product || !product.is_available) {
      return { ok: false, status: 409, error: `"${typeof raw.name === 'string' ? raw.name : 'un producto'}" ya no está disponible.` };
    }
    const picks = Array.isArray(raw.options) ? (raw.options as RawOptionPick[]) : [];
    verified.push({
      name: product.name,
      quantity: raw.quantity,
      price: priceItem(product, picks),
      options: optionLabels(product, picks),
    });
  }

  const total = verified.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const address =
    orderType === 'DINE_IN'
      ? (typeof customer.tableNumber === 'number' ? `Mesa ${customer.tableNumber}` : null)
      : (typeof customer.address === 'string' ? customer.address : null);

  const orderNumber = localOrderNumber();
  const pending: PendingOrder = {
    clientId,
    payload: body,
    orderNumber,
    status: 'pending',
    createdAt: new Date().toISOString(),
    // Snapshot legible para el KDS local (nombres/opciones ya resueltos
    // contra el menú con el que se validó este pedido).
    display: {
      customerName: customer.name.trim(),
      orderType,
      address,
      notes: typeof customer.notes === 'string' && customer.notes.trim() ? customer.notes.trim() : null,
      total,
      items: verified.map((i) => ({ name: i.name, quantity: i.quantity, options: i.options })),
    },
  };
  enqueuePendingOrder(pending);

  // Imprimir al instante: es lo que de verdad importa durante un corte —
  // best-effort, un fallo de impresión NO debe hacer fallar la aceptación
  // del pedido (ya quedó en cola para sincronizar).
  if (snapshot.kitchenTarget) {
    try {
      const ticketItems: LocalKitchenItem[] = verified.map((i) => ({
        name: i.name, quantity: i.quantity, options: i.options,
      }));
      const bytes = buildLocalKitchenTicket({
        orderNumber,
        customerName: customer.name.trim(),
        orderType,
        address,
        items: ticketItems,
        notes: typeof customer.notes === 'string' ? customer.notes : null,
      }, snapshot.restaurantName);
      await printRaw(parseTarget(snapshot.kitchenTarget), bytes);
    } catch (e) {
      logger.warn(`No se pudo imprimir la comanda local de ${orderNumber}:`, (e as Error).message);
    }
  } else {
    logger.warn(`Pedido ${orderNumber} aceptado sin imprimir: no hay destino de cocina cacheado.`);
  }

  return { ok: true, orderId: clientId, orderNumber, total };
}
