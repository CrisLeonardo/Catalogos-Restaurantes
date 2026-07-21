'use server';

import { createClient, createDinerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createOrderSchema } from '@/lib/schemas';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendPushToRestaurant } from '@/lib/push';
import { resolveTheme, computeTip, type ThemeRow } from '@/lib/theme/resolve';
import { isOpenNow, type WeeklyHours } from '@/lib/hours';
import { resolvePromo } from '@/lib/db/promos';
import { logActivity } from '@/lib/activity';
import { can } from '@/lib/permissions';
import { enqueueKitchenForOrder, enqueueReceiptForOrder } from '@/lib/print-agent';
import { awardLoyaltyForOrder, maybeAwardSignupBonus } from '@/lib/actions/loyalty';
import { getCustomerIdByAuthUser, resolveDinerAuthUserId } from '@/lib/db/loyalty';
import { resolveItemOptions } from '@/lib/order-options';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, writeStyledTable, freezeHeaderRow, autoFitColumns,
  workbookToBase64,
} from '@/lib/documents/excel';
import { longDate } from '@/lib/documents/format';
import type { DocumentBranding } from '@/lib/documents/types';
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

export async function createOrder(
  rawInput: unknown,
): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Datos del pedido inválidos.' };
  }

  const { restaurantId, items, customer, paymentMethod, cashAmount, tipAccepted, clientId } = parsed.data;

  const db = createServiceClient();

  // Reintento idempotente (cola offline del catálogo, ver migración 061):
  // si este client_id ya generó un pedido, devuélvelo tal cual SIN
  // repetir rate-limit, upsert_customer, promo, lealtad ni push — esos
  // efectos secundarios no son idempotentes y duplicarlos sería peor que
  // el problema que la cola intenta resolver.
  if (clientId) {
    const { data: existing } = await db
      .from('orders')
      .select('id, order_number, public_token')
      .eq('restaurant_id', restaurantId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (existing) {
      return {
        success: true,
        orderId: existing.id as string,
        orderNumber: existing.order_number as string,
        publicToken: existing.public_token as string,
      };
    }
  }

  // Rate-limit: endpoint público sin login. Frena inundación de pedidos
  // (spam de push/sonido al restaurante + crecimiento de tabla). 6/min por IP.
  const ip = clientIp(await headers());
  if (!rateLimit(`order:${ip}:${restaurantId}`, 6, 60_000)) {
    return { error: 'Has enviado varios pedidos muy seguido. Espera un momento e intenta de nuevo.' };
  }

  // Sesión del comensal (Google), si la hay: enlaza la cuenta al cliente
  // (por teléfono) al pedir, para ver/canjear puntos desde cualquier dispositivo.
  // Cookie propia del comensal — la sesión del personal no interviene aquí.
  const authClient = await createDinerClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  const authUserId = await resolveDinerAuthUserId(authUser?.id ?? null);

  // Cliente de lealtad autenticado: canjear recompensas o puntos exige sesión
  // de Google (nunca se resuelve por el teléfono escrito en el checkout, que
  // cualquiera puede teclear). null si no hay sesión o la cuenta no tiene
  // historial enlazado todavía.
  const loyaltyCustomerId = await getCustomerIdByAuthUser(restaurantId, authUserId);

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

  // Auto-pausa sin agente (mig. 069, OPCIONAL por restaurante): si el local
  // activó el toggle y su Agente Leogin lleva >5 min sin reportarse, el local
  // probablemente está SIN INTERNET y no vería este pedido — se rechaza con
  // un mensaje amable en vez de dejarlo en el limbo. Al volver el agente
  // (heartbeat de /api/agent/poll) los pedidos se reanudan solos.
  {
    const AUTO_PAUSE_STALE_MS = 5 * 60_000;
    const { data: agentRow } = await db
      .from('print_agents')
      .select('auto_pause_enabled, last_seen_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (
      agentRow?.auto_pause_enabled === true &&
      agentRow.last_seen_at &&
      Date.now() - new Date(agentRow.last_seen_at as string).getTime() > AUTO_PAUSE_STALE_MS
    ) {
      return {
        error:
          'Por un problema de conexión, el restaurante está atendiendo solo en el local por el momento. Intenta de nuevo en unos minutos.',
      };
    }
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
    .select('id, name, price, cost, is_available, options')
    .eq('restaurant_id', restaurantId)
    .in('id', productIds);

  if (productsError) return { error: productsError.message };

  const productById = new Map(
    (dbProducts ?? []).map((p) => [p.id as string, p]),
  );

  const verifiedItems: {
    productId: string | null;
    name: string;
    price: number;
    cost: number | null;
    quantity: number;
    options: OrderItemOption[];
    is_reward?: boolean;
    reward_id?: string | null;
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
      // Costo congelado al vender (margen histórico). El costo es del producto
      // base; las variantes/extras no llevan costo propio por ahora.
      cost: product.cost != null ? Number(product.cost) : null,
      quantity: item.quantity,
      options: resolvedOpts.snapshot,
    });
  }

  // ── Recompensas de lealtad canjeadas (migración 058) ──────────
  // El cliente solo manda ids; aquí verificamos que el saldo alcance. Si algo
  // falla, NO se crea el pedido (validamos ANTES de tocar la BD de pedidos).
  // El descuento real de puntos lo hace el RPC atómico tras crear el pedido.
  const rewardLines = parsed.data.rewardLines ?? [];
  let rewardPointsTotal = 0;
  const rewardRedeemIds: string[] = [];
  if (rewardLines.length > 0) {
    if (!loyaltyCustomerId) {
      return { error: 'Inicia sesión con Google para canjear recompensas.' };
    }

    const { data: acctR } = await db
      .from('loyalty_accounts')
      .select('points_balance')
      .eq('restaurant_id', restaurantId)
      .eq('customer_id', loyaltyCustomerId)
      .maybeSingle();
    const balanceR = Number(acctR?.points_balance) || 0;

    const ids = [...new Set(rewardLines.map((r) => r.rewardId))];
    const { data: rewards } = await db
      .from('loyalty_rewards')
      .select('id, product_id, title, points_cost, active, stock')
      .eq('restaurant_id', restaurantId)
      .in('id', ids);
    const rewardById = new Map((rewards ?? []).map((r) => [r.id as string, r]));

    const rProductIds = [...new Set((rewards ?? []).map((r) => r.product_id).filter(Boolean) as string[])];
    const { data: rProducts } = rProductIds.length
      ? await db.from('products').select('id, name, cost, is_active').in('id', rProductIds)
      : { data: [] as { id: string; name: string; cost: number | null; is_active: boolean }[] };
    const rProductById = new Map((rProducts ?? []).map((p) => [p.id as string, p]));

    for (const line of rewardLines) {
      const reward = rewardById.get(line.rewardId);
      if (!reward || !reward.active) {
        return { error: 'Una de las recompensas ya no está disponible. Actualiza tu carrito.' };
      }
      if (reward.stock != null && Number(reward.stock) <= 0) {
        return { error: `"${reward.title}" está agotada.` };
      }
      const prod = reward.product_id ? rProductById.get(reward.product_id as string) : null;
      rewardPointsTotal += Number(reward.points_cost) || 0;
      rewardRedeemIds.push(reward.id as string);
      verifiedItems.push({
        productId: (reward.product_id as string | null) ?? null,
        name: `🎁 ${reward.title}`,
        price: 0,
        cost: prod?.cost != null ? Number(prod.cost) : null,
        quantity: 1,
        options: [],
        is_reward: true,
        reward_id: reward.id as string,
      });
    }

    if (balanceR < rewardPointsTotal) {
      return { error: `Te faltan puntos para canjear esas recompensas (tienes ${balanceR}, necesitas ${rewardPointsTotal}).` };
    }
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

  // Promoción (cupón escrito o automática). Autoritativo en el servidor:
  // el descuento NUNCA se toma del cliente, se recalcula contra la BD.
  const applied = await resolvePromo(restaurantId, parsed.data.promoCode, subtotal, fee);
  const discount = applied ? applied.discount : 0;

  // Propina: solo para los tipos de pedido que el restaurante habilitó
  // (tipOrderTypes). Se calcula server-side sobre el subtotal (antes de
  // descuento); el cliente solo indica si la acepta (boolean), nunca el monto.
  const tip = computeTip(themeConfig, customer.type, tipAccepted, subtotal);

  const total = Math.max(0, subtotal + fee - discount + tip);

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
      p_auth_user_id:  authUserId,
      p_lat:           customer.type === 'DELIVERY' ? (customer.deliveryLat ?? null) : null,
      p_lng:           customer.type === 'DELIVERY' ? (customer.deliveryLng ?? null) : null,
    });
    customerId = (cid as string | null) ?? null;

    // Puntos de bienvenida (una sola vez) si este pedido se hizo con sesión de
    // Google — `upsert_customer` ya enlazó `auth_user_id` a este cliente arriba.
    // Best-effort: no debe retrasar ni romper la creación del pedido.
    if (authUserId && customerId) {
      maybeAwardSignupBonus(restaurantId, customerId).catch(() => {});
    }
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
    p_payment_method: customer.type === 'DINE_IN' ? 'CASH' : (paymentMethod ?? 'CASH'),
    p_cash_amount:    customer.type === 'DELIVERY' && (paymentMethod ?? 'CASH') === 'CASH' && cashAmount != null ? cashAmount : null,
    p_tip:            tip,
    p_client_id: clientId ?? null,
    p_items: verifiedItems.map((i) => ({
      product_id:       i.productId,
      name_snapshot:    i.name,
      price_snapshot:   i.price,
      cost_snapshot:    i.cost,
      quantity:         i.quantity,
      subtotal:         i.price * i.quantity,
      options_snapshot: i.options.length > 0 ? i.options : null,
      ...(i.is_reward ? { is_reward: true, reward_id: i.reward_id } : {}),
    })),
  });

  const order = placed as { id: string; order_number: string; public_token: string } | null;
  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  // Persistir la promo aplicada (metadata para recibos/reportes) y contar su uso.
  if (applied && discount > 0) {
    await db.from('orders').update({
      discount,
      promo_id: applied.promo.id,
      promo_code: applied.promo.code ?? null,
    }).eq('id', order.id);
    await db.rpc('increment_promo_usage', { p_id: applied.promo.id });
  }

  // Canje de recompensas (productos): descuenta los puntos de cada una de forma
  // atómica. Ya validamos saldo arriba; el RPC re-valida y nunca deja negativo.
  if (rewardRedeemIds.length > 0 && loyaltyCustomerId) {
    for (const rid of rewardRedeemIds) {
      await db.rpc('leogin_loyalty_redeem_reward', {
        p_restaurant_id: restaurantId,
        p_customer_id:   loyaltyCustomerId,
        p_reward_id:     rid,
        p_order_id:      order.id,
      });
    }
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

/** Resultado de crear un pedido desde el panel de mesero. */
export interface WaiterOrderResult {
  success?: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
}

/**
 * Crea un pedido desde la interfaz del mesero.
 * Autenticado: el mesero debe tener rol RESTAURANT_WAITER del restaurante.
 * Salta rate limit y pausa (el mesero está físicamente en el local).
 */
export async function createWaiterOrder(rawInput: unknown): Promise<WaiterOrderResult> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Datos del pedido inválidos.' };
  }

  const { restaurantId, items, customer, tipAccepted, clientId } = parsed.data;

  // Autenticación obligatoria (es mesero, no cliente anónimo).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const db = createServiceClient();

  const { data: waiterProfile } = await db
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  if (
    !waiterProfile ||
    waiterProfile.restaurant_id !== restaurantId ||
    !can(waiterProfile.role as string, waiterProfile.permissions as string[] | null, 'mesero')
  ) {
    return { error: 'No autorizado.' };
  }

  // Reintento idempotente (fallback offline del mesero — hub local o cola del
  // dispositivo, ver waiter-panel.tsx): si este client_id ya generó un
  // pedido, devuélvelo tal cual sin repetir push ni impresión (mismo patrón
  // que createOrder, migración 061).
  if (clientId) {
    const { data: existing } = await db
      .from('orders')
      .select('id, order_number')
      .eq('restaurant_id', restaurantId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (existing) {
      return { success: true, orderId: existing.id as string, orderNumber: existing.order_number as string };
    }
  }

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, modules, status, timezone')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) return { error: 'Restaurante no encontrado.' };
  if (restaurant.status !== 'active') return { error: 'El restaurante no está disponible.' };

  const modules = restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders) return { error: 'Este restaurante no acepta pedidos.' };

  // Validar productos desde BD (precio autoritativo).
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: dbProducts, error: productsError } = await db
    .from('products')
    .select('id, name, price, cost, is_available, options')
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
    cost: number | null;
    quantity: number;
    options: OrderItemOption[];
  }[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || !product.is_available) {
      return { error: `"${item.name}" ya no está disponible.` };
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
      cost: product.cost != null ? Number(product.cost) : null,
      quantity: item.quantity,
      options: resolvedOpts.snapshot,
    });
  }

  // Propina (si el restaurante la habilita para este tipo de pedido).
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;

  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tip = computeTip(themeConfig, customer.type, tipAccepted, subtotal);
  const total = Math.max(0, subtotal + tip);

  const address = customer.tableNumber !== undefined ? `Mesa ${customer.tableNumber}` : null;
  const notes = customer.coursePreference
    ? `[Servicio: ${customer.coursePreference}]${customer.notes ? ` · ${customer.notes}` : ''}`
    : (customer.notes ?? null);

  const { data: placed, error: orderError } = await db.rpc('place_order', {
    p_restaurant_id:  restaurantId,
    p_customer_name:  customer.name,
    p_customer_phone: customer.phone || '00000000',
    p_order_type:     'DINE_IN',
    p_address:        address,
    p_delivery_zone:  null,
    p_delivery_lat:   null,
    p_delivery_lng:   null,
    p_customer_id:    null,
    p_subtotal:       subtotal,
    p_delivery_fee:   0,
    p_total:          total,
    p_notes:          notes,
    p_payment_method: 'CASH',
    p_cash_amount:    null,
    p_tip:            tip,
    p_waiter_id:      user.id,
    p_client_id:      clientId ?? null,
    p_items: verifiedItems.map((i) => ({
      product_id:       i.productId,
      name_snapshot:    i.name,
      price_snapshot:   i.price,
      cost_snapshot:    i.cost,
      quantity:         i.quantity,
      subtotal:         i.price * i.quantity,
      options_snapshot: i.options.length > 0 ? i.options : null,
    })),
  });

  const order = placed as { id: string; order_number: string; public_token: string } | null;
  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  sendPushToRestaurant(restaurantId, {
    title: '🛎 Nuevo pedido (mesero)',
    body: `${order.order_number} · ${customer.name} · Mesa ${customer.tableNumber ?? '?'}`,
    tag: order.id,
    url: '/admin/pedidos',
  }).catch(() => {});

  // Auto-disparo a cocina: la comanda se imprime al instante vía el Agente de
  // impresión del local (no espera a que alguien confirme NEW→PREP). Best-effort:
  // no-op si el restaurante no tiene agente/destino de cocina configurado.
  try {
    await enqueueKitchenForOrder(restaurantId, order.id);
  } catch {
    // No bloquea el pedido del mesero si la impresión falla.
  }

  revalidatePath('/admin/mesero');
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

/**
 * Libera una mesa marcando como DELIVERED todos sus pedidos DINE_IN activos.
 * Solo el personal con permiso 'mesero' puede hacerlo.
 */
export async function freeTable(
  restaurantId: string,
  tableNumber: number,
): Promise<{ error?: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  const ownsBranch = profile?.role === 'GROUP_OWNER'
    ? (await resolveGroupBranchId()) === restaurantId
    : profile?.restaurant_id === restaurantId;
  if (
    !profile ||
    !ownsBranch ||
    !can(profile.role as string, profile.permissions as string[] | null, 'mesero')
  ) {
    return { error: 'No autorizado.' };
  }

  const tableAddress = `Mesa ${tableNumber}`;
  const { error } = await db
    .from('orders')
    .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('address', tableAddress)
    .eq('order_type', 'DINE_IN')
    .not('status', 'in', '("DELIVERED","CANCEL")');

  if (error) return { error: error.message };

  revalidatePath('/admin/mesero');
  revalidatePath('/admin/pedidos');
  return {};
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ error?: string }> {
  if (!orderId) return { error: 'ID de pedido requerido.' };

  const validStatuses: OrderStatus[] = [
    'NEW', 'PREP', 'READY', 'TRANSIT', 'SERVED', 'DELIVERED', 'CANCEL',
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

  const validRoles = ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER', 'GROUP_OWNER'];
  if (!validRoles.includes(profile.role)) return { error: 'No autorizado.' };

  // GROUP_OWNER usa el cliente RLS: la migración 053 limita la actualización a
  // pedidos de sucursales de su grupo (con service no habría filtro por sucursal).
  const db = profile.role === 'SUPER_ADMIN' ? createServiceClient() : supabase;

  // Al cancelar, devolver stock de productos con inventario (idempotente en BD:
  // restock_order no hace nada si el pedido ya estaba CANCEL). Va ANTES del update.
  if (status === 'CANCEL') {
    await db.rpc('restock_order', { p_order_id: orderId });
  }

  // Sella la marca de tiempo de la transición (analítica: tiempos y cancelación).
  const now = new Date().toISOString();
  const stamp: Record<string, string> =
    status === 'PREP'      ? { accepted_at: now }
    : status === 'READY'     ? { ready_at: now }
    : status === 'SERVED'    ? { served_at: now }
    : status === 'DELIVERED' ? { delivered_at: now }
    : status === 'CANCEL'    ? { cancelled_at: now }
    : {};

  const { error } = await db
    .from('orders')
    .update({ status, ...stamp })
    .eq('id', orderId);

  if (error) return { error: error.message };

  // Al confirmar (NEW→PREP): encola la comanda de cocina al agente de impresión
  // del restaurante (funciona desde cualquier dispositivo, incl. móvil). No-op
  // si no hay agente configurado; best-effort, no debe romper el cambio de estado.
  if (status === 'PREP') {
    // profile.restaurant_id es null para SUPER_ADMIN: resolver del pedido mismo.
    let kitchenRid = profile.restaurant_id as string | null;
    if (!kitchenRid) {
      const { data: orderRow } = await createServiceClient()
        .from('orders').select('restaurant_id').eq('id', orderId).single();
      kitchenRid = (orderRow?.restaurant_id as string) ?? null;
    }
    if (kitchenRid) {
      try {
        await enqueueKitchenForOrder(kitchenRid, orderId);
      } catch {
        /* impresión es best-effort */
      }
    }
  }

  // Acumula puntos de lealtad al entregar (best-effort; no-op si el módulo está
  // inactivo o el pedido no tiene cliente). No debe romper el cambio de estado.
  // SERVED cuenta aquí porque freeTable() (cierre manual de mesa DINE_IN) bypasea
  // esta función y nunca llega a otorgar puntos vía DELIVERED.
  if (status === 'DELIVERED' || status === 'SERVED') {
    let rid = profile.restaurant_id as string | null;
    if (!rid) {
      const { data: orderRow } = await createServiceClient()
        .from('orders').select('restaurant_id').eq('id', orderId).single();
      rid = (orderRow?.restaurant_id as string) ?? null;
    }
    if (rid) {
      try {
        await awardLoyaltyForOrder(rid, orderId);
      } catch {
        /* best-effort */
      }
    }
  }

  if (profile.restaurant_id) {
    logActivity({
      restaurantId: profile.restaurant_id,
      actorId: user.id,
      action: 'order_status',
      entity: status,
      meta: { orderId },
    });
  }

  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/mesero');
  revalidatePath('/admin/cocina');
  return {};
}

/**
 * Encola el recibo de caja de un pedido al agente de impresión del restaurante.
 * Lo llama el botón "Imprimir recibo" cuando el restaurante usa el Agente Leogin
 * (en vez de la impresión por navegador/QZ). Best-effort.
 */
export async function printReceiptViaAgent(orderId: string): Promise<{ error?: string }> {
  if (!orderId) return { error: 'ID de pedido requerido.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('restaurant_id')
    .eq('id', orderId)
    .single();
  if (!order) return { error: 'Pedido no encontrado.' };

  const allowed =
    profile.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'].includes(profile.role) &&
      profile.restaurant_id === order.restaurant_id) ||
    (profile.role === 'GROUP_OWNER' && (await resolveGroupBranchId()) === order.restaurant_id);
  if (!allowed) return { error: 'No autorizado.' };

  try {
    await enqueueReceiptForOrder(order.restaurant_id as string, orderId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return {};
}

/* ── Export de pedidos — PDF (cliente) + Excel (servidor) ────── */

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: 'Nuevo',
  PREP: 'En preparación',
  READY: 'Listo',
  TRANSIT: 'En camino',
  SERVED: 'Servido',
  DELIVERED: 'Entregado',
  CANCEL: 'Cancelado',
};

export interface OrderExportRow {
  orderNumber: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  orderType: string;
  status: string;
  items: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes: string;
}

/** Autentica y arma los datos de pedidos para exportar (el PDF y el Excel comparten esta base). */
async function buildOrdersExportData(
  restaurantId: string,
  days: number,
): Promise<{
  rows: OrderExportRow[];
  branding: DocumentBranding;
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
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (profile?.role === 'GROUP_OWNER' && (await resolveGroupBranchId()) === restaurantId);
  if (!allowed) return { error: 'No autorizado.' };
  if (!can(profile?.role, profile?.permissions as string[] | null, 'pedidos')) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - safeDays);

  const [{ data: restaurant }, { data: orders }, branding] = await Promise.all([
    db.from('restaurants').select('name, slug, timezone').eq('id', restaurantId).single(),
    db
      .from('orders')
      .select('order_number, created_at, customer_name, customer_phone, order_type, status, subtotal, delivery_fee, total, notes, items:order_items(name_snapshot, quantity, options_snapshot)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000),
    resolveRestaurantBranding(restaurantId),
  ]);

  const tz = (restaurant?.timezone as string) || 'America/Guatemala';

  const rows: OrderExportRow[] = (orders ?? []).map((o) => {
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
    const items = ((o.items as Record<string, unknown>[] | null) ?? [])
      .map((it) => {
        const opts = (it.options_snapshot as OrderItemOption[] | null) ?? [];
        const extra = opts.length > 0 ? ` (${opts.map((x) => x.choice).join(', ')})` : '';
        return `${it.quantity}x ${it.name_snapshot}${extra}`;
      })
      .join(' | ');
    return {
      orderNumber: String(o.order_number),
      date: fecha,
      time: hora,
      customerName: String(o.customer_name),
      customerPhone: String(o.customer_phone),
      orderType: o.order_type === 'PICKUP' ? 'Para llevar' : o.order_type === 'DINE_IN' ? 'En local' : 'Domicilio',
      status: ORDER_STATUS_LABEL[o.status as OrderStatus] ?? String(o.status),
      items,
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.delivery_fee),
      total: Number(o.total),
      notes: (o.notes as string | null) ?? '',
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  return {
    rows,
    branding,
    restaurantName: (restaurant?.name as string) ?? 'Restaurante',
    filename: `pedidos-${restaurant?.slug ?? 'restaurante'}-${today}`,
  };
}

/** Datos ya armados (numéricos + marca) para dibujar el PDF de pedidos en el cliente. */
export async function getOrdersPdfData(
  restaurantId: string,
  days: number = 30,
): Promise<{
  rows: OrderExportRow[]; branding: DocumentBranding; restaurantName: string; filename: string;
} | { error: string }> {
  return buildOrdersExportData(restaurantId, days);
}

/** Genera el listado de pedidos como .xlsx real, con marca del restaurante. */
export async function exportOrdersXlsx(
  restaurantId: string,
  days: number = 30,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const data = await buildOrdersExportData(restaurantId, days);
  if ('error' in data) return data;
  const { rows, branding, filename } = data;

  const subtitle = `Últimos ${days} días · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Pedidos');
  addBrandedHeader(ws, { branding, title: 'Listado de pedidos', subtitle, columnsSpan: 12 });

  const { headerRow } = writeStyledTable(
    ws, branding,
    ['Número', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Tipo', 'Estado', 'Productos', 'Subtotal', 'Envío', 'Total', 'Notas'],
    rows.map((r) => [
      r.orderNumber, r.date, r.time, r.customerName, r.customerPhone, r.orderType, r.status, r.items,
      r.subtotal, r.deliveryFee, r.total, r.notes,
    ]),
    { currencyCols: [9, 10, 11] },
  );
  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws, { max: 36 });

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `${filename}.xlsx` };
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
  orderType: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  customerName: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  loyaltyPoints: number;
  loyaltyDiscount: number;
  total: number;
  createdAt: string;
  items: PublicOrderItem[];
}

/**
 * Cancela un pedido desde el cliente final usando el token público.
 * Solo se permite cuando el estado es NEW (aún no confirmado por el restaurante).
 */
export async function cancelPublicOrder(
  token: string,
  restaurantId: string,
): Promise<{ error?: string; success?: boolean }> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return { error: 'Token inválido.' };
  if (!restaurantId) return { error: 'Restaurante inválido.' };

  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('id, status, restaurant_id')
    .eq('public_token', token)
    .single();

  if (!order || order.restaurant_id !== restaurantId)
    return { error: 'Pedido no encontrado.' };

  if (order.status !== 'NEW')
    return { error: 'Solo puedes cancelar un pedido que aún no ha sido confirmado por el restaurante.' };

  // Devolver stock antes de marcar CANCEL (idempotente en BD).
  await db.rpc('restock_order', { p_order_id: order.id });

  const { error } = await db
    .from('orders')
    .update({ status: 'CANCEL', cancelled_at: new Date().toISOString() })
    .eq('id', order.id);

  if (error) return { error: error.message };

  return { success: true };
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
      'order_number, status, order_type, customer_name, subtotal, delivery_fee, discount, loyalty_points_redeemed, loyalty_discount, total, created_at, restaurant_id, items:order_items(name_snapshot, quantity, subtotal, options_snapshot)',
    )
    .eq('public_token', token)
    .single();

  // El pedido debe pertenecer al restaurante del subdominio actual.
  if (!data || data.restaurant_id !== restaurantId) return null;

  return {
    orderNumber: data.order_number as string,
    status: data.status as OrderStatus,
    orderType: data.order_type as 'PICKUP' | 'DELIVERY' | 'DINE_IN',
    customerName: data.customer_name as string,
    subtotal: Number(data.subtotal),
    deliveryFee: Number(data.delivery_fee),
    discount: Number(data.discount ?? 0),
    loyaltyPoints: Number(data.loyalty_points_redeemed ?? 0),
    loyaltyDiscount: Number(data.loyalty_discount ?? 0),
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

/**
 * Resuelve el token público de un pedido por su clientId — el UUID que el
 * propio dispositivo generó al crearlo (ver migración 061). Lo usa
 * "Mis pedidos" para los pedidos aceptados por el hub local sin conexión
 * (llegan sin publicToken porque aún no existían en Supabase — ver
 * hub-fallback.ts): una vez que el agente los sincroniza, este lookup les
 * da el token real para poder rastrearlos. No es sensible: el clientId es
 * un UUID que solo conoce el dispositivo que lo generó.
 */
export async function getOrderRefByClientId(
  restaurantId: string,
  clientId: string,
): Promise<{ token: string; orderNumber: string; total: number } | null> {
  if (!restaurantId || !clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) return null;

  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('public_token, order_number, total')
    .eq('restaurant_id', restaurantId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (!data) return null;

  return {
    token: data.public_token as string,
    orderNumber: data.order_number as string,
    total: Number(data.total),
  };
}

export interface MyOrderRef {
  token: string;
  orderNumber: string;
  createdAt: string;
  total: number;
}

/**
 * Pedidos del comensal con SESIÓN INICIADA (Google), resueltos por su cuenta
 * enlazada (customers.auth_user_id) — no por dispositivo. Se combinan en el
 * cliente con los guardados en localStorage, así "Mis pedidos" y el pedido en
 * curso siguen al comensal a cualquier dispositivo donde inicie sesión.
 * [] si no hay sesión o la cuenta todavía no tiene un pedido enlazado (nunca
 * lanza: el historial local sigue funcionando igual para invitados).
 */
export async function getMyOrderRefs(restaurantId: string): Promise<MyOrderRef[]> {
  const authClient = await createDinerClient();
  const { data: { user } } = await authClient.auth.getUser();
  const authUserId = await resolveDinerAuthUserId(user?.id ?? null);
  const customerId = await getCustomerIdByAuthUser(restaurantId, authUserId);
  if (!customerId) return [];

  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('public_token, order_number, total, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(25);

  return ((data ?? []) as { public_token: string; order_number: string; total: number; created_at: string }[])
    .map((o) => ({
      token: o.public_token,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      total: Number(o.total),
    }));
}
