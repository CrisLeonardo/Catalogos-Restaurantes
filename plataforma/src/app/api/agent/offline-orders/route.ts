/* ============================================================
   POST /api/agent/offline-orders — sincroniza pedidos del HUB
   ------------------------------------------------------------
   Cuando vuelve el internet, el Agente Leogin sube en lote los
   pedidos tomados en modo emergencia. Idempotente: cada pedido
   trae su client_id (mig. 061) — reintentar el lote no duplica.

   Los precios se recalculan AQUÍ contra la BD (autoritativo):
   el hub solo manda productId/cantidad/opciones. Si un producto
   cambió mientras no había internet, el pedido entra igual con
   el precio actual (la comida ya se sirvió; la realidad manda),
   salvo que el producto ya no exista → se reporta el error.

   Body:    { orders: [{ clientId, tableNumber, guestName?, notes?,
                          createdAt?, items: [{ productId, quantity,
                          options?: [{groupId, choiceId}] }] }] }
   Reply:   { results: [{ clientId, ok, orderNumber?, duplicate?, error? }] }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import { resolveItemOptions } from '@/lib/order-pricing';
import { sendPushToRestaurant } from '@/lib/push';
import type { ProductOptionGroup } from '@/types';

export const runtime = 'nodejs';

interface HubOrderInput {
  clientId: string;
  tableNumber: number;
  guestName?: string;
  notes?: string;
  createdAt?: string;
  items: { productId: string; quantity: number; options?: { groupId: string; choiceId: string }[] }[];
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const body = await req.json().catch(() => null) as { orders?: HubOrderInput[] } | null;
  const orders = Array.isArray(body?.orders) ? body.orders.slice(0, 25) : [];
  if (orders.length === 0) return NextResponse.json({ results: [] });

  const db = createServiceClient();
  const results: { clientId: string; ok: boolean; orderNumber?: string; duplicate?: boolean; error?: string }[] = [];

  for (const o of orders) {
    const clientId = typeof o?.clientId === 'string' && UUID_RE.test(o.clientId) ? o.clientId : null;
    if (!clientId) {
      results.push({ clientId: String(o?.clientId ?? ''), ok: false, error: 'clientId inválido.' });
      continue;
    }
    const tableNumber = Math.trunc(Number(o.tableNumber));
    const items = Array.isArray(o.items) ? o.items.slice(0, 50) : [];
    if (!tableNumber || tableNumber < 1 || items.length === 0) {
      results.push({ clientId, ok: false, error: 'Pedido incompleto (mesa o ítems).' });
      continue;
    }

    // Precios autoritativos desde la BD (mismo camino que el mesero en línea).
    const productIds = [...new Set(items.map((i) => String(i.productId)))];
    const { data: dbProducts } = await db
      .from('products')
      .select('id, name, price, cost, options')
      .eq('restaurant_id', agent.restaurantId)
      .in('id', productIds);
    const productById = new Map((dbProducts ?? []).map((p) => [p.id as string, p]));

    let failed: string | null = null;
    const verified: { productId: string; name: string; price: number; cost: number | null; quantity: number; options: unknown[] }[] = [];
    for (const it of items) {
      const product = productById.get(String(it.productId));
      const qty = Math.trunc(Number(it.quantity));
      if (!product || !qty || qty < 1 || qty > 99) {
        failed = 'Un producto del pedido ya no existe.';
        break;
      }
      const resolved = resolveItemOptions(
        product.options as ProductOptionGroup[] | null,
        it.options,
        product.name as string,
      );
      if ('error' in resolved) { failed = resolved.error; break; }
      verified.push({
        productId: product.id as string,
        name: product.name as string,
        price: Number(product.price) + resolved.delta,
        cost: product.cost != null ? Number(product.cost) : null,
        quantity: qty,
        options: resolved.snapshot,
      });
    }
    if (failed) {
      results.push({ clientId, ok: false, error: failed });
      continue;
    }

    const subtotal = verified.reduce((s, i) => s + i.price * i.quantity, 0);
    const guestName = (o.guestName ?? '').trim().slice(0, 80) || `Mesa ${tableNumber}`;
    const baseNotes = (o.notes ?? '').trim().slice(0, 400);
    const notes = `[Modo emergencia]${baseNotes ? ` · ${baseNotes}` : ''}`;

    const { data: placed, error } = await db.rpc('place_order', {
      p_restaurant_id:  agent.restaurantId,
      p_customer_name:  guestName,
      p_customer_phone: '00000000',
      p_order_type:     'DINE_IN',
      p_address:        `Mesa ${tableNumber}`,
      p_delivery_zone:  null,
      p_delivery_lat:   null,
      p_delivery_lng:   null,
      p_customer_id:    null,
      p_subtotal:       subtotal,
      p_delivery_fee:   0,
      p_total:          subtotal,
      p_notes:          notes,
      p_payment_method: 'CASH',
      p_cash_amount:    null,
      p_tip:            0,
      p_waiter_id:      null,
      p_client_id:      clientId,
      p_items: verified.map((i) => ({
        product_id:       i.productId,
        name_snapshot:    i.name,
        price_snapshot:   i.price,
        cost_snapshot:    i.cost,
        quantity:         i.quantity,
        subtotal:         i.price * i.quantity,
        options_snapshot: i.options.length > 0 ? i.options : null,
      })),
    });

    const order = placed as { id: string; order_number: string; duplicate?: boolean } | null;
    if (error || !order) {
      results.push({ clientId, ok: false, error: error?.message ?? 'Error al crear el pedido.' });
      continue;
    }

    results.push({
      clientId,
      ok: true,
      orderNumber: order.order_number,
      ...(order.duplicate ? { duplicate: true } : {}),
    });

    // Aviso al panel (solo para pedidos nuevos, no re-sincronizados).
    if (!order.duplicate) {
      sendPushToRestaurant(agent.restaurantId, {
        title: '🛎 Pedido sincronizado (modo emergencia)',
        body:  `${order.order_number} · Mesa ${tableNumber}`,
        tag:   order.id,
        url:   '/admin/pedidos',
      }).catch(() => {});
    }
  }

  return NextResponse.json({ results });
}
