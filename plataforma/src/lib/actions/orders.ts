'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { createOrderSchema } from '@/lib/schemas';
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
  const db = createServiceClient();

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, modules, status, whatsapp_number, timezone, hours, orders_paused, pause_message, delivery_zones')
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

  // Cobertura de delivery: si el restaurante configuró zonas, el pedido a
  // domicilio DEBE traer una zona válida (la UI ya lo exige; esto es el
  // candado del servidor para carritos viejos o requests manuales).
  const zones = (restaurant.delivery_zones as string[] | null) ?? [];
  if (customer.type === 'DELIVERY' && zones.length > 0) {
    if (!customer.zone || !zones.includes(customer.zone)) {
      return {
        error:
          'El restaurante no llega a tu zona. Elige una zona de cobertura o pide para recoger en el local.',
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

  const { data: orderNumber } = await db.rpc('generate_order_number', {
    p_restaurant_id: restaurantId,
  });

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

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      restaurant_id:  restaurantId,
      order_number:   orderNumber ?? 'ORD-???',
      customer_name:  customer.name,
      customer_phone: customer.phone,
      order_type:     customer.type,
      address:        customer.address ?? null,
      ...(customer.type === 'DELIVERY' && customer.zone ? { delivery_zone: customer.zone } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      payment_method: 'CASH',
      status:         'NEW',
      subtotal,
      delivery_fee:   fee,
      total,
      notes:          customer.notes ?? null,
    })
    .select('id, order_number, public_token')
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  const { error: itemsError } = await db.from('order_items').insert(
    verifiedItems.map((i) => ({
      order_id:         order.id,
      product_id:       i.productId,
      name_snapshot:    i.name,
      price_snapshot:   i.price,
      quantity:         i.quantity,
      subtotal:         i.price * i.quantity,
      options_snapshot: i.options.length > 0 ? i.options : null,
    })),
  );

  if (itemsError) return { error: itemsError.message };

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

/**
 * Exporta los pedidos de los últimos `days` días como CSV (para Excel).
 * Solo el staff del restaurante (o el Super Admin) puede exportar.
 */
export async function exportOrdersCsv(
  restaurantId: string,
  days: number = 30,
): Promise<{ csv?: string; filename?: string; error?: string }> {
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
    db.from('restaurants').select('slug, timezone').eq('id', restaurantId).single(),
    db
      .from('orders')
      .select('order_number, created_at, customer_name, customer_phone, order_type, status, subtotal, delivery_fee, total, notes, items:order_items(name_snapshot, quantity, options_snapshot)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const tz = (restaurant?.timezone as string) || 'America/Guatemala';
  const header = [
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
      o.order_number, fecha, hora, o.customer_name, o.customer_phone,
      o.order_type === 'PICKUP' ? 'Para llevar' : 'Domicilio',
      o.status, productos,
      Number(o.subtotal).toFixed(2), Number(o.delivery_fee).toFixed(2), Number(o.total).toFixed(2),
      (o.notes as string | null) ?? '',
    ].map(csvCell).join(',');
  });

  // BOM para que Excel abra el UTF-8 con acentos correctos.
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  const today = new Date().toISOString().slice(0, 10);
  return { csv, filename: `pedidos-${restaurant?.slug ?? 'restaurante'}-${today}.csv` };
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
