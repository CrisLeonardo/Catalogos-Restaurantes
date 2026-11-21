'use server';

/* ============================================================
   EL PEDIDO DE LA MESA (auditoría «La carta que vende», §5 pieza 5)
   ------------------------------------------------------------
   Lista compartida por mesa (migración 190). Cada teléfono suma lo
   suyo con un nombre corto; todos la ven (se consulta cada pocos
   segundos con el carrito abierto) y cualquiera la manda a cocina
   como UN pedido. El envío reutiliza createOrder con el id de la
   cuenta como client_id: dos «Enviar» a la vez dan un solo pedido.

   Solo existe si el restaurante encendió `pedidoDeMesa` y la mesa
   existe. Sin la tabla (migración pendiente) → 'sin-tabla' y el
   carrito sigue como siempre. Nada de esto es del personal: es el
   comensal, anónimo, con el QR de su mesa en la mano.
   ============================================================ */

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantByIdCached } from '@/lib/db/restaurants';
import { faltaLaMigracion } from '@/lib/db/migracion-ausente';
import { mesaExiste } from '@/lib/mesa-valida';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { createOrder } from '@/lib/actions/orders';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tras enviarse, los demás teléfonos ven «Ya se mandó» este rato. */
const ENVIADA_VISIBLE_MS = 30 * 60 * 1000;

export interface LineaMesa {
  id: string;
  persona: string;
  nombre: string;
  precio: number;
  quantity: number;
  opciones: string[];
  mia: boolean;
}

export type EstadoMesa =
  | { estado: 'apagada' | 'sin-tabla' }
  | { estado: 'vacia' }
  | { estado: 'abierta'; cuentaId: string; lineas: LineaMesa[] }
  | { estado: 'enviada'; orderNumber: string | null; token: string | null };

export interface ItemParaMesa {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  options?: Array<{ groupId: string; groupName: string; choiceId: string; choiceName: string; priceDelta: number; variantId?: string }>;
}

async function permitido(restaurantId: string, mesa: number): Promise<'ok' | 'apagada'> {
  if (!UUID.test(restaurantId)) return 'apagada';
  const r = await getRestaurantByIdCached(restaurantId);
  const cfg = r?.resolved.config;
  if (!cfg || cfg.pedidoDeMesa !== true || !mesaExiste(mesa, cfg.dineInTableCount)) return 'apagada';
  return 'ok';
}

async function limite(restaurantId: string): Promise<boolean> {
  const ip = clientIp(await headers());
  return rateLimit(`mesa:${ip}:${restaurantId}`, 90, 60_000);
}

export async function estadoMesa(restaurantId: string, mesa: number, visitorId: string): Promise<EstadoMesa> {
  if ((await permitido(restaurantId, mesa)) !== 'ok') return { estado: 'apagada' };
  const db = createServiceClient();
  const { data: abierta, error } = await db
    .from('mesa_cuentas').select('id')
    .eq('restaurant_id', restaurantId).eq('mesa', mesa).eq('estado', 'abierta')
    .maybeSingle();
  if (error) return { estado: faltaLaMigracion(error) ? 'sin-tabla' : 'apagada' };
  if (abierta) {
    const { data: filas } = await db
      .from('mesa_cuenta_lineas')
      .select('id, visitor_id, persona, nombre, precio, quantity, options')
      .eq('cuenta_id', abierta.id)
      .order('created_at');
    return {
      estado: 'abierta',
      cuentaId: abierta.id,
      lineas: (filas ?? []).map((f) => ({
        id: f.id as string,
        persona: f.persona as string,
        nombre: f.nombre as string,
        precio: Number(f.precio),
        quantity: Number(f.quantity),
        opciones: Array.isArray(f.options) ? (f.options as Array<{ choiceName?: string }>).map((o) => o.choiceName ?? '').filter(Boolean) : [],
        mia: f.visitor_id === visitorId,
      })),
    };
  }
  const desde = new Date(Date.now() - ENVIADA_VISIBLE_MS).toISOString();
  const { data: enviada } = await db
    .from('mesa_cuentas').select('order_id, enviada_at')
    .eq('restaurant_id', restaurantId).eq('mesa', mesa).eq('estado', 'enviada')
    .gte('enviada_at', desde).order('enviada_at', { ascending: false }).limit(1).maybeSingle();
  if (enviada?.order_id) {
    const { data: o } = await db.from('orders').select('order_number, public_token').eq('id', enviada.order_id).maybeSingle();
    return { estado: 'enviada', orderNumber: (o?.order_number as string | null) ?? null, token: (o?.public_token as string | null) ?? null };
  }
  return { estado: 'vacia' };
}

export async function sumarAMesa(input: {
  restaurantId: string; mesa: number; visitorId: string; persona: string; items: ItemParaMesa[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { restaurantId, mesa, visitorId } = input;
  const persona = (input.persona ?? '').trim().slice(0, 24);
  if (!UUID.test(visitorId) || !persona) return { ok: false, error: 'Escribe tu nombre para la mesa.' };
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 30) return { ok: false, error: 'No hay nada que sumar.' };
  if ((await permitido(restaurantId, mesa)) !== 'ok') return { ok: false, error: 'Esta mesa no tiene pedido compartido.' };
  if (!(await limite(restaurantId))) return { ok: false, error: 'Vas muy rápido. Espera unos segundos.' };

  const db = createServiceClient();
  // Solo platillos de ESTE restaurante (el precio lo vuelve a calcular el pedido).
  const ids = [...new Set(input.items.map((i) => i.productId).filter((id) => UUID.test(id)))];
  const { data: propios } = await db.from('products').select('id').eq('restaurant_id', restaurantId).in('id', ids);
  const validos = new Set((propios ?? []).map((p) => p.id as string));
  const items = input.items.filter((i) => validos.has(i.productId) && i.quantity >= 1 && i.quantity <= 50);
  if (items.length === 0) return { ok: false, error: 'Esos platillos ya no están en la carta.' };

  // La cuenta abierta de la mesa, o una nueva (el índice único resuelve la carrera).
  let cuentaId: string | null = null;
  const leer = async () => (await db.from('mesa_cuentas').select('id').eq('restaurant_id', restaurantId).eq('mesa', mesa).eq('estado', 'abierta').maybeSingle()).data?.id as string | undefined;
  cuentaId = (await leer()) ?? null;
  if (!cuentaId) {
    const { data, error } = await db.from('mesa_cuentas').insert({ restaurant_id: restaurantId, mesa }).select('id').single();
    if (error && faltaLaMigracion(error)) return { ok: false, error: 'El pedido de la mesa todavía no está activo.' };
    cuentaId = (data?.id as string | undefined) ?? (await leer()) ?? null;
  }
  if (!cuentaId) return { ok: false, error: 'No se pudo abrir el pedido de la mesa. Intenta de nuevo.' };

  const { error } = await db.from('mesa_cuenta_lineas').insert(items.map((i) => ({
    cuenta_id: cuentaId,
    visitor_id: visitorId,
    persona,
    product_id: i.productId,
    nombre: String(i.name).slice(0, 120),
    precio: Math.max(0, Number(i.price) || 0),
    quantity: i.quantity,
    options: i.options?.length ? i.options : null,
  })));
  if (error) return { ok: false, error: 'No se pudo sumar a la mesa. Intenta de nuevo.' };
  return { ok: true };
}

export async function quitarDeMesa(input: { restaurantId: string; mesa: number; visitorId: string; lineaId: string }): Promise<{ ok: boolean }> {
  if (!UUID.test(input.visitorId) || !UUID.test(input.lineaId)) return { ok: false };
  if ((await permitido(input.restaurantId, input.mesa)) !== 'ok') return { ok: false };
  const db = createServiceClient();
  // Solo lo propio, y solo de una cuenta todavía abierta de esta mesa.
  const { data: cuenta } = await db.from('mesa_cuentas').select('id')
    .eq('restaurant_id', input.restaurantId).eq('mesa', input.mesa).eq('estado', 'abierta').maybeSingle();
  if (!cuenta) return { ok: false };
  const { error } = await db.from('mesa_cuenta_lineas').delete()
    .eq('id', input.lineaId).eq('cuenta_id', cuenta.id).eq('visitor_id', input.visitorId);
  return { ok: !error };
}

export async function enviarMesa(input: { restaurantId: string; mesa: number; cuentaId: string }): Promise<
  { ok: true; orderNumber: string; token: string } | { ok: false; error: string }
> {
  const { restaurantId, mesa, cuentaId } = input;
  if (!UUID.test(cuentaId)) return { ok: false, error: 'Pedido de la mesa no válido.' };
  if ((await permitido(restaurantId, mesa)) !== 'ok') return { ok: false, error: 'Esta mesa no tiene pedido compartido.' };
  const db = createServiceClient();
  const { data: cuenta } = await db.from('mesa_cuentas').select('id, estado, order_id')
    .eq('id', cuentaId).eq('restaurant_id', restaurantId).eq('mesa', mesa).maybeSingle();
  if (!cuenta) return { ok: false, error: 'Ese pedido de la mesa ya no existe.' };

  const { data: filas } = await db.from('mesa_cuenta_lineas')
    .select('product_id, nombre, precio, quantity, options').eq('cuenta_id', cuentaId).order('created_at');
  if (!filas || filas.length === 0) return { ok: false, error: 'La mesa todavía no tiene platillos.' };

  // createOrder: mismas reglas, precios y candados que cualquier pedido del
  // público. client_id = la cuenta → si otro teléfono ya lo mandó, devuelve ESE.
  const r = await createOrder({
    restaurantId,
    items: filas.map((f) => ({
      productId: f.product_id,
      name: f.nombre,
      price: Number(f.precio) > 0 ? Number(f.precio) : 0.01,
      quantity: Number(f.quantity),
      ...(Array.isArray(f.options) && f.options.length ? { options: (f.options as Array<{ groupId: string; choiceId: string; variantId?: string }>).map((o) => ({ groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}) })) } : {}),
    })),
    customer: { name: `Mesa ${mesa}`, phone: '', type: 'DINE_IN', tableNumber: mesa },
    paymentMethod: 'CASH',
    tipAccepted: false,
    clientId: cuentaId,
  });
  if (!r.success || !r.orderId) return { ok: false, error: r.error ?? 'No se pudo mandar a cocina. Intenta de nuevo.' };

  await db.from('mesa_cuentas').update({ estado: 'enviada', order_id: r.orderId, enviada_at: new Date().toISOString() })
    .eq('id', cuentaId).eq('estado', 'abierta');
  return { ok: true, orderNumber: r.orderNumber ?? '', token: r.publicToken ?? '' };
}
