'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createOrderSchema } from '@/lib/schemas';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendPushToRestaurant } from '@/lib/push';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { isOpenNow, type WeeklyHours } from '@/lib/hours';
import type {
  OrderItemOption,
  OrderStatus,
  ProductOptionGroup,
} from '@/types';

export interface CreateOrderResult {
  success?: boolean;
  orderId?: string;
  orderNumber?: string;
  /** Token de la página pública de seguimiento (/pedido/[token]). */
  publicToken?: string;
  error?: string;
}

/**
 * Resuelve las opciones elegidas contra los grupos REALES del producto (BD):
 * valida ids, exige los grupos requeridos, respeta `max` y devuelve el
 * delta total + el snapshot con nombres/precios congelados.
 */
function resolveItemOptions(
  groups: ProductOptionGroup[] | null,
  picked: { groupId: string; choiceId: string }[] | undefined,
  productName: string,
): { delta: number; snapshot: OrderItemOption[] } | { error: string } {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const picks = picked ?? [];

  const snapshot: OrderItemOption[] = [];
  let delta = 0;

  for (const group of safeGroups) {
    const inGroup = picks.filter((p) => p.groupId === group.id);

    if (group.type === 'single') {
      if (inGroup.length > 1)
        return { error: `Opciones inválidas en "${productName}".` };
      if (group.required && inGroup.length === 0)
        return { error: `Elige "${group.name}" para "${productName}".` };
    } else if (group.max && group.max > 0 && inGroup.length > group.max) {
      return { error: `Máximo ${group.max} en "${group.name}" de "${productName}".` };
    }

    const seen = new Set<string>();
    for (const pick of inGroup) {
      if (seen.has(pick.choiceId))
        return { error: `Opciones duplicadas en "${productName}".` };
      seen.add(pick.choiceId);

      const choice = group.choices.find((c) => c.id === pick.choiceId);
      if (!choice)
        return { error: `"${productName}" cambió sus opciones. Actualiza tu carrito.` };

      const d = Number(choice.priceDelta) || 0;
      delta += d;
      snapshot.push({ group: group.name, choice: choice.name, priceDelta: d });
    }
  }

  // Elecciones que apuntan a grupos inexistentes → carrito viejo.
  const knownGroupIds = new Set(safeGroups.map((g) => g.id));
  if (picks.some((p) => !knownGroupIds.has(p.groupId)))
    return { error: `"${productName}" cambió sus opciones. Actualiza tu carrito.` };

  return { delta, snapshot };
}

export async function createOrder(
  rawInput: unknown,
): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Datos del pedido inválidos.' };
  }

  const { restaurantId, items, customer } = parsed.data;

  // Rate-limit: endpoint público sin login. Frena inundación de pedidos
  // (spam de push/sonido al restaurante + crecimiento de tabla). 6/min por IP.
  const ip = clientIp(await headers());
  if (!rateLimit(`order:${ip}:${restaurantId}`, 6, 60_000)) {
    return { error: 'Has enviado varios pedidos muy seguido. Espera un momento e intenta de nuevo.' };
  }

  const db = createServiceClient();

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, modules, status, whatsapp_number, timezone, hours, orders_paused, pause_message, delivery_zones, location_lat, location_lng, delivery_radius_km')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) return { error: 'Restaurante no encontrado.' };
  if (restaurant.status !== 'active')
    return { error: 'El restaurante no está disponible.' };

  const modules = restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders)
    return { error: 'Este restaurante no acepta pedidos en línea.' };

  // Operación: pausa manual y horario real también se validan AQUÍ
  // (el cliente puede tener la página abierta desde antes del cierre).
  if (restaurant.orders_paused) {
    return {
      error:
        (restaurant.pause_message as string | null)?.trim() ||
        'Los pedidos están pausados por el momento. Intenta más tarde.',
    };
  }
  if (
    !isOpenNow(
      restaurant.hours as WeeklyHours | null,
      (restaurant.timezone as string) || 'America/Guatemala',
    )
  ) {
    return { error: 'El restaurante está cerrado en este momento.' };
  }

  // Cobertura de delivery: si el restaurante configuró zonas de texto, el pedido
  // a domicilio DEBE traer una zona válida.
  const zones = (restaurant.delivery_zones as string[] | null) ?? [];
  if (customer.type === 'DELIVERY' && zones.length > 0) {
    if (!customer.zone || !zones.includes(customer.zone)) {
      return {
        error:
          'El restaurante no llega a tu zona. Elige una zona de cobertura o pide para recoger en el local.',
      };
    }
  }

  // Cobertura geográfica: si el restaurante tiene ubicación + radio configurados,
  // las coordenadas del cliente son OBLIGATORIAS y se validan con Haversine.
  const geoLat = restaurant.location_lat as number | null;
  const geoLng = restaurant.location_lng as number | null;
  const geoRadius = restaurant.delivery_radius_km as number | null;

  if (customer.type === 'DELIVERY' && geoLat !== null && geoLng !== null && geoRadius !== null) {
    if (customer.deliveryLat === undefined || customer.deliveryLng === undefined) {
      return { error: 'Este restaurante requiere que indiques tu ubicación en el mapa.' };
    }

    // RPC Haversine en el servidor (la UI ya hizo la validación; esto es el candado).
    const { data: coverage } = await db.rpc('check_delivery_coverage', {
      p_restaurant_id: restaurantId,
      p_lat: customer.deliveryLat,
      p_lng: customer.deliveryLng,
    });

    const cov = coverage as { covered: boolean; distance_km: number | null; radius_km: number | null } | null;
    if (!cov?.covered) {
      const dist = cov?.distance_km ? ` (estás a ${cov.distance_km} km)` : '';
      const radius = cov?.radius_km ?? geoRadius;
      return {
        error: `Tu ubicación está fuera de la zona de entrega${dist}. El restaurante llega hasta ${radius} km.`,
      };
    }
  }

  // SEGURIDAD: los precios NUNCA se toman del cliente (serían falsificables).
  // Se leen de la BD (base + deltas de opciones), validando que cada producto
  // pertenezca a ESTE restaurante y siga disponible. Los snapshots se congelan.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: dbProducts, error: productsError } = await db
    .from('products')
    .select('id, name, price, is_available, options')
    .eq('restaurant_id', restaurantId)
    .in('id', productIds);

  if (productsError) return { error: productsError.message };

  const productById = new Map(
    (dbProducts ?? []).map((p) => [p.id as string, p]),
  );

  const verifiedItems: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    options: OrderItemOption[];
  }[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || !product.is_available) {
      return { error: `"${item.name}" ya no está disponible. Actualiza tu carrito.` };
    }

    const resolvedOpts = resolveItemOptions(
      product.options as ProductOptionGroup[] | null,
      item.options,
      product.name as string,
    );
    if ('error' in resolvedOpts) return { error: resolvedOpts.error };

    verifiedItems.push({
      productId: product.id as string,
      name: product.name as string,
      price: Number(product.price) + resolvedOpts.delta,
      quantity: item.quantity,
      options: resolvedOpts.snapshot,
    });
  }

  // El costo de envío también se resuelve en el servidor (tema del restaurante).
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;

  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const fee = customer.type === 'DELIVERY' ? Math.max(0, Number(themeConfig.deliveryFee) || 0) : 0;
  const total = subtotal + fee;

  // Registro automático del cliente (clave: teléfono normalizado por
  // restaurante). Si la migración 010 no corrió aún, el pedido sigue sin
  // romperse: customer_id queda en null.
  const phoneKey = customer.phone.replace(/\D/g, '');
  let customerId: string | null = null;
  if (phoneKey.length >= 7) {
    const { data: cid } = await db.rpc('upsert_customer', {
      p_restaurant_id: restaurantId,
      p_name:          customer.name,
      p_phone:         phoneKey,
      p_address:       customer.type === 'DELIVERY' ? (customer.address ?? '') : '',
      p_zone:          customer.zone ?? '',
      p_total:         total,
    });
    customerId = (cid as string | null) ?? null;
  }

  const address =
    customer.type === 'DINE_IN'
      ? (customer.tableNumber !== undefined ? `Mesa ${customer.tableNumber}` : null)
      : (customer.address ?? null);
  const notes =
    customer.type === 'DINE_IN' && customer.coursePreference
      ? `[Servicio: ${customer.coursePreference}]${customer.notes ? ` · ${customer.notes}` : ''}`
      : (customer.notes ?? null);

  // Numeración atómica + pedido + ítems en UNA transacción (RPC place_order):
  // evita el número duplicado por carrera (count(*)+1) y los pedidos huérfanos
  // si la inserción de ítems fallara a mitad. Ver migración 016.
  const { data: placed, error: orderError } = await db.rpc('place_order', {
    p_restaurant_id:  restaurantId,
    p_customer_name:  customer.name,
    p_customer_phone: customer.phone,
    p_order_type:     customer.type,
    p_address:        address,
    p_delivery_zone:  customer.type === 'DELIVERY' && customer.zone ? customer.zone : null,
    p_delivery_lat:   customer.type === 'DELIVERY' && customer.deliveryLat !== undefined ? customer.deliveryLat : null,
    p_delivery_lng:   customer.type === 'DELIVERY' && customer.deliveryLng !== undefined ? customer.deliveryLng : null,
    p_customer_id:    customerId,
    p_subtotal:       subtotal,
    p_delivery_fee:   fee,
    p_total:          total,
    p_notes:          notes,
    p_items: verifiedItems.map((i) => ({
      product_id:       i.productId,
      name_snapshot:    i.name,
      price_snapshot:   i.price,
      quantity:         i.quantity,
      subtotal:         i.price * i.quantity,
      options_snapshot: i.options.length > 0 ? i.options : null,
    })),
  });

  const order = placed as { id: string; order_number: string; public_token: string } | null;
  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  // Notificación push server-side: llega a la barra del sistema aunque la
  // app esté cerrada o en segundo plano (requiere VAPID configurado).
  const typeLabel =
    customer.type === 'DELIVERY' ? 'A domicilio' :
    customer.type === 'DINE_IN'  ? 'Comer aquí'  :
    'Para llevar';

  sendPushToRestaurant(restaurantId, {
    title: '🛎 Nuevo pedido',
    body:  `${order.order_number} · ${customer.name} · ${typeLabel}`,
    tag:   order.id,
    url:   '/admin/pedidos',
  }).catch(() => {});

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    publicToken: order.public_token as string,
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ error?: string }> {
  if (!orderId) return { error: 'ID de pedido requerido.' };

  const validStatuses: OrderStatus[] = [
    'NEW', 'PREP', 'READY', 'TRANSIT', 'DELIVERED', 'CANCEL',
  ];
  if (!validStatuses.includes(status)) return { error: 'Estado inválido.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'No autorizado.' };

  const validRoles = ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF'];
  if (!validRoles.includes(profile.role)) return { error: 'No autorizado.' };

  const db = profile.role === 'SUPER_ADMIN' ? createServiceClient() : supabase;

  const { error } = await db
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) return { error: error.message };

  revalidatePath('/admin/pedidos');
  return {};
}

/* ── Export CSV (panel del dueño) ──────────────────────────── */

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Autentica y devuelve los datos crudos de pedidos para exportar. */
async function fetchOrdersForExport(
  restaurantId: string,
  days: number,
): Promise<{
  rows: string[][];
  headers: string[];
  restaurantName: string;
  filename: string;
} | { error: string }> {
  if (!restaurantId) return { error: 'Restaurante inválido.' };
  const safeDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 366);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId);
  if (!allowed) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - safeDays);

  const [{ data: restaurant }, { data: orders }] = await Promise.all([
    db.from('restaurants').select('name, slug, timezone').eq('id', restaurantId).single(),
    db
      .from('orders')
      .select('order_number, created_at, customer_name, customer_phone, order_type, status, subtotal, delivery_fee, total, notes, items:order_items(name_snapshot, quantity, options_snapshot)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const tz = (restaurant?.timezone as string) || 'America/Guatemala';
  const headers = [
    'Numero', 'Fecha', 'Hora', 'Cliente', 'Telefono', 'Tipo', 'Estado',
    'Productos', 'Subtotal', 'Envio', 'Total', 'Notas',
  ];

  const rows = (orders ?? []).map((o) => {
    const created = new Date(o.created_at as string);
    let fecha = '';
    let hora = '';
    try {
      fecha = created.toLocaleDateString('es-GT', { timeZone: tz });
      hora = created.toLocaleTimeString('es-GT', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch {
      fecha = created.toLocaleDateString('es-GT');
      hora = created.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    }
    const productos = ((o.items as Record<string, unknown>[] | null) ?? [])
      .map((it) => {
        const opts = (it.options_snapshot as OrderItemOption[] | null) ?? [];
        const extra = opts.length > 0 ? ` (${opts.map((x) => x.choice).join(', ')})` : '';
        return `${it.quantity}x ${it.name_snapshot}${extra}`;
      })
      .join(' | ');
    return [
      String(o.order_number), fecha, hora, String(o.customer_name), String(o.customer_phone),
      o.order_type === 'PICKUP' ? 'Para llevar' : o.order_type === 'DINE_IN' ? 'En local' : 'Domicilio',
      String(o.status), productos,
      Number(o.subtotal).toFixed(2), Number(o.delivery_fee).toFixed(2), Number(o.total).toFixed(2),
      (o.notes as string | null) ?? '',
    ];
  });

  const today = new Date().toISOString().slice(0, 10);
  return {
    rows,
    headers,
    restaurantName: (restaurant?.name as string) ?? 'Restaurante',
    filename: `pedidos-${restaurant?.slug ?? 'restaurante'}-${today}`,
  };
}

/**
 * Exporta pedidos de los últimos `days` días como datos estructurados
 * (para generar Excel HTML o PDF en el cliente sin dependencias extra).
 */
export async function exportOrdersStructured(
  restaurantId: string,
  days: number = 30,
): Promise<{ rows: string[][]; headers: string[]; restaurantName: string; filename: string } | { error: string }> {
  return fetchOrdersForExport(restaurantId, days);
}

/**
 * Exporta los pedidos de los últimos `days` días como CSV (para Excel).
 * Solo el staff del restaurante (o el Super Admin) puede exportar.
 */
export async function exportOrdersCsv(
  restaurantId: string,
  days: number = 30,
): Promise<{ csv?: string; filename?: string; error?: string }> {
  const result = await fetchOrdersForExport(restaurantId, days);
  if ('error' in result) return result;
  const csv = '﻿' + [result.headers.join(','), ...result.rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
  return { csv, filename: `${result.filename}.csv` };
}


/* ── Seguimiento público (/pedido/[token]) ─────────────────── */

export interface PublicOrderItem {
  name: string;
  quantity: number;
  subtotal: number;
  options: OrderItemOption[] | null;
}

export interface PublicOrder {
  orderNumber: string;
  status: OrderStatus;
  orderType: 'PICKUP' | 'DELIVERY';
  customerName: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  items: PublicOrderItem[];
}

/**
 * Estado de un pedido por su token público. El token es un UUID opaco que
 * solo conoce quien hizo el pedido; no expone teléfono ni dirección.
 * Se usa para el render inicial Y para el polling de estado en vivo.
 */
export async function getPublicOrder(
  token: string,
  restaurantId: string,
): Promise<PublicOrder | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  if (!restaurantId) return null;

  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select(
      'order_number, status, order_type, customer_name, subtotal, delivery_fee, total, created_at, restaurant_id, items:order_items(name_snapshot, quantity, subtotal, options_snapshot)',
    )
    .eq('public_token', token)
    .single();

  // El pedido debe pertenecer al restaurante del subdominio actual.
  if (!data || data.restaurant_id !== restaurantId) return null;

  return {
    orderNumber: data.order_number as string,
    status: data.status as OrderStatus,
    orderType: data.order_type as 'PICKUP' | 'DELIVERY',
    customerName: data.customer_name as string,
    subtotal: Number(data.subtotal),
    deliveryFee: Number(data.delivery_fee),
    total: Number(data.total),
    createdAt: data.created_at as string,
    items: ((data.items as Record<string, unknown>[] | null) ?? []).map((it) => ({
      name: it.name_snapshot as string,
      quantity: Number(it.quantity),
      subtotal: Number(it.subtotal),
      options: (it.options_snapshot as OrderItemOption[] | null) ?? null,
    })),
  };
}
