/* ============================================================
   CANALES EXTERNOS · traducción de pedidos (Fase 5A)
   ------------------------------------------------------------
   PedidosYa, Rappi y UberEats mandan su propio identificador de producto
   y su propio número de pedido. Aquí se traduce todo eso al formato que
   entiende createOrder(), que es el mismo del checkout web.

   Sin dependencias de Next ni de red: entra un payload, sale un input de
   pedido o un error. Así se puede probar sin levantar el endpoint.
   ============================================================ */

import crypto from 'node:crypto';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

/** Canales que acepta la ingesta. Coincide con el CHECK de orders.source. */
export const CHANNELS = ['PEDIDOSYA', 'RAPPI', 'UBEREATS', 'OTRO'] as const;
export type Channel = (typeof CHANNELS)[number];

/* ── Formato de entrada ──────────────────────────────────────
   Deliberadamente distinto del de createOrder: un integrador externo no
   tiene por qué conocer los uuid de Leogin ni su forma interna. Manda su
   sku y su número de pedido; la traducción es cosa nuestra. */

export const externalOrderSchema = z.object({
  channel: z.enum(CHANNELS),
  /**
   * Número de pedido de la plataforma externa. Es la llave de
   * idempotencia: si el middleware reintenta porque se le perdió la
   * respuesta, el pedido no se duplica.
   */
  external_id: z.string().min(1).max(120),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(120),
        quantity: z.number().int().positive().max(99),
        note: z.string().max(140).optional(),
      }),
    )
    .min(1, 'El pedido no trae ítems')
    .max(50, 'Demasiados ítems'),
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().max(40).optional(),
    type: z.enum(['PICKUP', 'DELIVERY']),
    address: z.string().max(300).optional(),
    notes: z.string().max(500).optional(),
  }),
  /** Tarifa de envío que cobró la plataforma. Informativa; puede ser 0. */
  delivery_fee: z.number().min(0).max(10_000).default(0),
  payment_method: z.enum(['CASH', 'CARD']).default('CASH'),
});

export type ExternalOrder = z.infer<typeof externalOrderSchema>;

/**
 * UUID estable derivado del canal + su número de pedido.
 *
 * createOrder ya trae idempotencia por clientId (migración 061, para la
 * cola offline del catálogo) y aquí se reusa tal cual: el mismo pedido
 * externo reintentado produce el mismo clientId y devuelve el pedido que
 * ya existía en vez de crear otro. Un middleware que reintenta porque se
 * le perdió la respuesta no le duplica la venta al restaurante.
 *
 * Se le da forma de UUID v5 (versión 5 = nombre + espacio de nombres),
 * que es exactamente lo que esto es: un hash determinista de un nombre.
 */
export function idempotencyId(channel: string, externalId: string): string {
  const h = crypto.createHash('sha256').update(`${channel}:${externalId}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';                                        // versión 5
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16); // variante RFC 4122
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export interface ResolvedLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
}

export type ResolveResult =
  | { ok: true; lines: ResolvedLine[] }
  | { ok: false; error: string; skusDesconocidos: string[] };

/**
 * Traduce los sku del canal a productos de Leogin.
 *
 * Dos reglas que no se negocian:
 *
 * 1. **El precio sale de products, nunca del payload.** El canal externo
 *    dice QUÉ se pidió, no cuánto vale. Aceptar su monto haría que una
 *    API key filtrada sirviera para facturarle al restaurante cualquier
 *    cifra.
 * 2. **Un sku sin mapear rechaza el pedido entero, no se salta la línea.**
 *    Un pedido al que le falta un plato entra a la cocina como si
 *    estuviera completo y sale mal, y el restaurante se entera por el
 *    reclamo del cliente. Es preferible un error que el middleware pueda
 *    reintentar tras arreglar el mapa.
 */
export async function resolveLines(
  restaurantId: string,
  channel: Channel,
  items: ExternalOrder['items'],
): Promise<ResolveResult> {
  const db = createServiceClient();
  const skus = [...new Set(items.map((i) => i.sku))];

  const { data: mapa } = await db
    .from('channel_product_map')
    .select('external_sku, product_id')
    .eq('restaurant_id', restaurantId)
    .eq('channel', channel)
    .in('external_sku', skus);

  const porSku = new Map((mapa ?? []).map((m) => [m.external_sku as string, m.product_id as string]));
  const desconocidos = skus.filter((s) => !porSku.has(s));
  if (desconocidos.length > 0) {
    return {
      ok: false,
      error: `Hay productos sin mapear para ${channel}. Configuralos en Canales y reintentá.`,
      skusDesconocidos: desconocidos,
    };
  }

  const productIds = [...new Set([...porSku.values()])];
  const { data: productos } = await db
    .from('products')
    .select('id, name, price, is_available, restaurant_id')
    .in('id', productIds);

  const porId = new Map((productos ?? []).map((p) => [p.id as string, p]));
  const lines: ResolvedLine[] = [];

  for (const item of items) {
    const productId = porSku.get(item.sku)!;
    const prod = porId.get(productId);

    // El mapa apunta a un producto borrado, o a uno de otro restaurante
    // (la llave es por restaurante, pero el mapa se edita a mano).
    if (!prod || prod.restaurant_id !== restaurantId) {
      return {
        ok: false,
        error: `El sku "${item.sku}" apunta a un producto que ya no existe. Revisá el mapa en Canales.`,
        skusDesconocidos: [item.sku],
      };
    }

    // Agotado NO rechaza el pedido: la venta ya ocurrió en la otra app y
    // el cliente ya pagó allá. Rechazarlo aquí no la deshace — solo deja
    // a la cocina sin enterarse. Entra, y que el restaurante decida.
    lines.push({
      productId: prod.id as string,
      name: prod.name as string,
      price: Number(prod.price),
      quantity: item.quantity,
      ...(item.note ? { note: item.note } : {}),
    });
  }

  return { ok: true, lines };
}

/** Arma el input de createOrder a partir del pedido externo ya resuelto. */
export function toCreateOrderInput(
  restaurantId: string,
  pedido: ExternalOrder,
  lines: ResolvedLine[],
): Record<string, unknown> {
  // El esquema de Leogin pide 8 dígitos guatemaltecos; lo que mande la
  // plataforma puede venir con código de país o con formato. Si no queda
  // un número válido se manda vacío en vez de inventarlo: para PICKUP el
  // teléfono es opcional, y para DELIVERY el error lo dará createOrder
  // con su propio mensaje.
  const digits = (pedido.customer.phone ?? '').replace(/\D/g, '');
  const local = digits.length > 8 ? digits.slice(-8) : digits;

  return {
    restaurantId,
    items: lines,
    customer: {
      name: pedido.customer.name,
      phone: /^\d{8}$/.test(local) ? local : '',
      type: pedido.customer.type,
      ...(pedido.customer.address ? { address: pedido.customer.address } : {}),
      ...(pedido.customer.notes ? { notes: pedido.customer.notes } : {}),
    },
    deliveryFee: pedido.delivery_fee,
    paymentMethod: pedido.payment_method,
    clientId: idempotencyId(pedido.channel, pedido.external_id),
  };
}
