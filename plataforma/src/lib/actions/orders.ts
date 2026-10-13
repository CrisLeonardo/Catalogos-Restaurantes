'use server';

import { createClient, createDinerClient, getStaffUser } from '@/lib/supabase/server';
import { canActOnRestaurant, resolveEffectiveRole } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { revalidarSalon } from '@/lib/salon-cache';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { createOrderSchema, waiterOrderSchema, type CreateOrderInput } from '@/lib/schemas';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendPushToRestaurant } from '@/lib/push';
import { resolveTheme, computeTip, type ThemeRow } from '@/lib/theme/resolve';
import type { ThemeConfig } from '@/lib/theme/defaults';
import { edicionPermitePedir, estadoEdicion, motivoSinPedidos } from '@/lib/vitrina/edicion';
import { isOpenNow, type WeeklyHours, type HourExceptions } from '@/lib/hours';
import { resolveCoupon } from '@/lib/db/cupones';
import { getDeliveryZones, zoneFeeFrom, type DeliveryZone } from '@/lib/db/zones';
import { logActivity } from '@/lib/activity';
import { can } from '@/lib/permissions';
import { necesitaAprobacion, puedeAprobar, type Aprobador } from '@/lib/void-approval';
import { listarAprobadores, verificarAprobador } from '@/lib/auth/firma-encargado';
import { enqueueKitchenForOrder, enqueueReceiptForOrder, enqueueSplitBillTicket } from '@/lib/print-agent';
import {
  buildBillLines, computeSplit, UNASSIGNED_ID,
  type BillAssignment, type SplitMode,
} from '@/lib/bill-split';
import { awardLoyaltyForOrder, maybeAwardSignupBonus } from '@/lib/actions/loyalty';
import { notifyOrderStatus } from '@/lib/whatsapp/notify';
import { getCustomerIdByAuthUser, resolveDinerAuthUserId } from '@/lib/db/loyalty';
import { resolveItemOptions } from '@/lib/order-options';
import { isUnavailable } from '@/lib/product-availability';
import { isPaymentMethod, type PaymentMethod } from '@/lib/payment-method';
import { repartirPagos, metodoDominante, type PagoEntrada } from '@/lib/table-payments';
import { hayColumnaMesa, direccionDeMesa } from '@/lib/db/mesa-columna';
import { assertTableAccess } from '@/lib/auth/table-access';
import { cerrarTurnoDeMesa, hayPagosDeMesa } from '@/lib/db/table-sessions';
import { faltaLaColumna, faltaLaFuncion, faltaLaTabla } from '@/lib/db/migracion-ausente';

/**
 * «Los pedidos de la mesa N», como par columna/valor.
 *
 * El salón buscaba sus pedidos con `.eq('address', 'Mesa 4')`: cobrar,
 * mover, juntar y marcar servido dependían de que ese texto se hubiera
 * escrito idéntico en todos lados, y bastaba una mesa con nombre para que
 * dejaran de encontrarse. Desde la migración 127 la identidad es
 * `table_number`; esto es lo único que queda sabiendo que hubo dos formas,
 * y se borra el día que la migración esté en todas partes.
 *
 * Devuelve el par y no la consulta ya filtrada a propósito: el constructor
 * de Supabase es «thenable», así que un ayudante `async` que lo recibiera
 * ejecutaría la consulta a medio montar al hacerle `await`.
 */
function campoMesa(porNumero: boolean, tableNumber: number): [string, string | number] {
  return porNumero ? ['table_number', tableNumber] : ['address', direccionDeMesa(tableNumber)];
}
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import { getOrdersForTable, type OrderWithItems } from '@/lib/db/orders';
import { emitirFacturaAutomatica } from '@/lib/actions/fel';
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

export type VerifiedOrderItem = {
  productId: string | null;
  name: string;
  price: number;
  cost: number | null;
  quantity: number;
  options: OrderItemOption[];
  note?: string;
  /** Asiento al que se le apunta (migración 123); solo el panel de mesero. */
  seat?: number | null;
  /** Solo lo usa createOrder (canje de recompensas); createWaiterOrder nunca los fija. */
  is_reward?: boolean;
  reward_id?: string | null;
};

/**
 * Valida y fija precio de los ítems del carrito contra la BD — nunca del
 * cliente, sería falsificable. Compartida por createOrder (cliente) y
 * createWaiterOrder (mesero): antes vivía duplicada en las dos, con el
 * riesgo de que un fix de seguridad se aplicara a una y se quedara sin
 * aplicar en la otra.
 * @param notAvailableSuffix Texto extra en el mensaje de error (cada
 *   llamador le habla distinto a su público — cliente vs. mesero).
 */
async function verifyAndPriceItems(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  items: CreateOrderInput['items'],
  notAvailableSuffix = '',
): Promise<{ error: string } | { items: VerifiedOrderItem[] }> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: dbProducts, error: productsError } = await db
    .from('products')
    .select('id, name, price, cost, is_available, unavailable_at, track_stock, stock, options')
    .eq('restaurant_id', restaurantId)
    .in('id', productIds);

  if (productsError) return { error: productsError.message };

  // La MISMA regla con la que el menú decide qué enseña como pedible
  // (lib/product-availability.ts): lo marcado agotado vuelve solo a las
  // 12 h. Antes aquí se leía `is_available` crudo y el comensal se
  // encontraba con «ya no está disponible» al confirmar un platillo que el
  // menú le ofrecía (auditoría 2026-10-02, CAT-01).
  const ahora = Date.now();

  const productById = new Map(
    (dbProducts ?? []).map((p) => [p.id as string, p]),
  );

  const verifiedItems: VerifiedOrderItem[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || isUnavailable(product, ahora)) {
      return { error: `"${item.name}" ya no está disponible.${notAvailableSuffix}` };
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
      note: item.note,
      seat: item.seat ?? null,
    });
  }

  return { items: verifiedItems };
}

/** Notificación push server-side al restaurante: llega a la barra del
 *  sistema aunque la app esté cerrada o en segundo plano (requiere VAPID
 *  configurado). Best-effort a propósito — nunca debe tumbar la creación
 *  del pedido si el push falla. */
function notifyNewOrder(
  restaurantId: string,
  order: { id: string; order_number: string },
  body: string,
  title = '🛎 Nuevo pedido',
): void {
  sendPushToRestaurant(restaurantId, {
    title,
    body,
    tag: order.id,
    url: '/admin/pedidos',
    // El service worker reenvía este `type` por postMessage a las pestañas
    // abiertas del panel (ver public/sw.js). Sin él el push llegaba a la barra
    // del sistema pero la pestaña no se enteraba: el aviso dentro del panel
    // dependía únicamente del socket de Realtime, y si ese socket estaba caído
    // (red inestable, laptop que despertó de suspensión, JWT vencido) no sonaba
    // NADA ni aparecía nada. Las llamadas al mesero ya usaban esta vía.
    type: 'new_order',
  }).catch(() => {});
}

/**
 * Subtotal + envío + cupón + propina = total. Autoritativo en el servidor:
 * el cliente nunca manda montos, solo el código de cupón y si acepta la
 * propina — todo lo demás se recalcula aquí contra la BD/el tema vigente.
 */
async function computeOrderPricing(
  restaurantId: string,
  themeConfig: ThemeConfig,
  orderType: CreateOrderInput['customer']['type'],
  tipAccepted: boolean,
  couponCode: string | undefined,
  verifiedItems: VerifiedOrderItem[],
  zoneName: string | null | undefined,
  zones: DeliveryZone[],
): Promise<{
  subtotal: number;
  fee: number;
  discount: number;
  tip: number;
  total: number;
  applied: Awaited<ReturnType<typeof resolveCoupon>>;
}> {
  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Envío: si el restaurante configuró zonas (migración 103/104), manda la
  // tarifa de la zona elegida; si no, la tarifa plana del tema. La tarifa se
  // resuelve SIEMPRE contra la BD por el nombre de la zona — el cliente manda
  // qué zona eligió, nunca cuánto cuesta.
  // Un nombre de zona que no existe cae a la tarifa plana en vez de a 0: el
  // pedido ya viene validado contra la lista de zonas más arriba, así que
  // llegar aquí sin coincidencia significa desconcierto, no envío gratis.
  // `zones` es la lista que createOrder ya leyó de la BD para validar la
  // cobertura (antes resolveZoneFee la volvía a pedir).
  const zoneFee = orderType === 'DELIVERY' ? zoneFeeFrom(zones, zoneName) : null;
  const fee = orderType === 'DELIVERY'
    ? (zoneFee ?? Math.max(0, Number(themeConfig.deliveryFee) || 0))
    : 0;

  // Cupón (código escrito por el cliente). Autoritativo en el servidor:
  // el descuento NUNCA se toma del cliente, se recalcula contra la BD.
  const applied = await resolveCoupon(restaurantId, couponCode, subtotal);
  const discount = applied ? applied.discount : 0;

  // Propina: solo para los tipos de pedido que el restaurante habilitó
  // (tipOrderTypes). Se calcula server-side sobre el subtotal (antes de
  // descuento); el cliente solo indica si la acepta (boolean), nunca el monto.
  const tip = computeTip(themeConfig, orderType, tipAccepted, subtotal);

  const total = Math.max(0, subtotal + fee - discount + tip);

  return { subtotal, fee, discount, tip, total, applied };
}

/** Sesión de Google del comensal (si la hay) y su cliente de lealtad. */
async function resolveDinerForOrder(
  restaurantId: string,
): Promise<{ authUserId: string | null; loyaltyCustomerId: string | null }> {
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
  return { authUserId, loyaltyCustomerId };
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

  /* «Pedir» es el botón del comensal, y cada consulta es una ida y vuelta
     de Render a la base. Iban EN FILA —reintento, límite, sesión, lealtad,
     restaurante, agente, zonas, cobertura, precios, tema—: diez viajes antes
     de crear nada. Todas las LECTURAS salen juntas y los resultados se
     comprueban después en el mismo orden de siempre, así que cada error es
     el mismo que antes y sale en el mismo caso.

     Lo que NO entra en la tanda es lo que escribe: el límite de pedidos
     por IP cuenta un intento y un reintento de la cola offline no debe
     gastarlo (va después del chequeo de reintento, como siempre), y cliente,
     pedido, cupón y canje dependen de los precios ya validados. Comparado
     contra la versión anterior con pedidos reales de la base local — mismos
     importes, mismos errores (2026-09-25). */
  const conGeo =
    customer.type === 'DELIVERY' &&
    customer.deliveryLat !== undefined &&
    customer.deliveryLng !== undefined;
  const [
    { data: existing },
    { data: restaurant },
    { data: agentRow },
    zones,
    { data: coverage },
    priced,
    { data: themeRow },
    diner,
  ] = await Promise.all([
    clientId
      ? db
          .from('orders')
          .select('id, order_number, public_token')
          .eq('restaurant_id', restaurantId)
          .eq('client_id', clientId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('restaurants')
      .select('id, modules, status, whatsapp_number, timezone, hours, hour_exceptions, orders_paused, pause_message, delivery_zones, location_lat, location_lng, delivery_radius_km')
      .eq('id', restaurantId)
      .single(),
    db
      .from('print_agents')
      .select('auto_pause_enabled, last_seen_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    customer.type === 'DELIVERY' ? getDeliveryZones(restaurantId) : Promise.resolve([] as DeliveryZone[]),
    // Solo lee (plpgsql con un SELECT). Se pide siempre que haya coordenadas;
    // su respuesta solo cuenta si el restaurante tiene radio configurado.
    conGeo
      ? db.rpc('check_delivery_coverage', {
          p_restaurant_id: restaurantId,
          p_lat: customer.deliveryLat,
          p_lng: customer.deliveryLng,
        })
      : Promise.resolve({ data: null }),
    // SEGURIDAD: los precios NUNCA se toman del cliente (serían falsificables).
    // Se leen de la BD (base + deltas de opciones), validando que cada producto
    // pertenezca a ESTE restaurante y siga disponible. Los snapshots se congelan.
    verifyAndPriceItems(db, restaurantId, items, ' Actualiza tu carrito.'),
    // El costo de envío también se resuelve en el servidor (tema del restaurante).
    db
      .from('restaurant_themes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .single(),
    resolveDinerForOrder(restaurantId),
  ]);

  // Reintento idempotente (cola offline del catálogo, ver migración 061):
  // si este client_id ya generó un pedido, devuélvelo tal cual SIN
  // repetir rate-limit, upsert_customer, cupón, lealtad ni push — esos
  // efectos secundarios no son idempotentes y duplicarlos sería peor que
  // el problema que la cola intenta resolver.
  if (existing) {
    return {
      success: true,
      orderId: existing.id as string,
      orderNumber: existing.order_number as string,
      publicToken: existing.public_token as string,
    };
  }

  // Rate-limit: endpoint público sin login. Frena inundación de pedidos
  // (spam de push/sonido al restaurante + crecimiento de tabla). 6/min por IP.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`order:${ip}:${restaurantId}`, 6, 60_000))) {
    return { error: 'Has enviado varios pedidos muy seguido. Espera un momento e intenta de nuevo.' };
  }

  const { authUserId, loyaltyCustomerId } = diner;

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
      new Date(),
      restaurant.hour_exceptions as HourExceptions | null,
    )
  ) {
    return { error: 'El restaurante está cerrado en este momento.' };
  }

  // Vitrina en modo lanzamiento: fuera de la edición (aún no abre o ya
  // cerró) el cliente no puede pedir, aunque tenga la página abierta desde
  // antes. Solo aquí, en el pedido del CLIENTE: mesero, caja y hub siguen
  // registrando lo que el negocio decida (lib/vitrina/edicion.ts).
  {
    const tema = resolveTheme((themeRow as ThemeRow) ?? null);
    const edicion = estadoEdicion(tema.config, Date.now());
    if (!edicionPermitePedir(edicion)) {
      return { error: motivoSinPedidos(edicion, tema.content.vitrina.launchClosed, (restaurant.timezone as string) || 'America/Guatemala') };
    }
  }

  // Cobertura de delivery: si el restaurante configuró zonas, el pedido a
  // domicilio DEBE traer una válida. Las zonas viven en su propia tabla desde
  // la migración 104 (antes eran nombres sueltos en restaurants.delivery_zones,
  // ahora histórica) — la comparación es sin distinguir mayúsculas porque el
  // nombre viaja como texto en el pedido y no como id.
  if (customer.type === 'DELIVERY' && zones.length > 0) {
    const zoneOk = customer.zone
      && zones.some((z) => z.nombre.toLowerCase() === customer.zone!.trim().toLowerCase());
    if (!zoneOk) {
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

    // RPC Haversine en el servidor (la UI ya hizo la validación; esto es el
    // candado). Ya se pidió arriba, junto con el resto de lecturas.
    const cov = coverage as { covered: boolean; distance_km: number | null; radius_km: number | null } | null;
    if (!cov?.covered) {
      const dist = cov?.distance_km ? ` (estás a ${cov.distance_km} km)` : '';
      const radius = cov?.radius_km ?? geoRadius;
      return {
        error: `Tu ubicación está fuera de la zona de entrega${dist}. El restaurante llega hasta ${radius} km.`,
      };
    }
  }

  if ('error' in priced) return { error: priced.error };
  const verifiedItems: VerifiedOrderItem[] = priced.items;

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

    const ids = [...new Set(rewardLines.map((r) => r.rewardId))];
    const [{ data: acctR }, { data: rewards }] = await Promise.all([
      db
        .from('loyalty_accounts')
        .select('points_balance')
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', loyaltyCustomerId)
        .maybeSingle(),
      db
        .from('loyalty_rewards')
        .select('id, product_id, title, points_cost, active, stock')
        .eq('restaurant_id', restaurantId)
        .in('id', ids),
    ]);
    const balanceR = Number(acctR?.points_balance) || 0;
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

  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;

  const { subtotal, fee, discount, tip, total, applied } = await computeOrderPricing(
    restaurantId, themeConfig, customer.type, tipAccepted, parsed.data.couponCode, verifiedItems,
    customer.type === 'DELIVERY' ? customer.zone : null,
    zones,
  );

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
      note:             i.note || null,
      ...(i.is_reward ? { is_reward: true, reward_id: i.reward_id } : {}),
    })),
  });

  const order = placed as { id: string; order_number: string; public_token: string } | null;
  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  // Persistir el cupón aplicado (metadata para recibos/reportes) y contar su
  // uso. Las dos escrituras son independientes: van a la vez.
  if (applied && discount > 0) {
    await Promise.all([
      db.from('orders').update({
        discount,
        coupon_id: applied.coupon.id,
        coupon_code: applied.coupon.code,
      }).eq('id', order.id),
      db.rpc('increment_coupon_usage', { p_id: applied.coupon.id }),
    ]);
  }

  // Canje de recompensas (productos): descuenta los puntos de cada una de forma
  // atómica. Ya validamos saldo arriba; el RPC re-valida y nunca deja negativo.
  // En fila A PROPÓSITO: cada canje re-lee el saldo que dejó el anterior.
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

  const typeLabel =
    customer.type === 'DELIVERY' ? 'A domicilio' :
    customer.type === 'DINE_IN'  ? 'Comer aquí'  :
    'Para llevar';
  notifyNewOrder(restaurantId, order, `${order.order_number} · ${customer.name} · ${typeLabel}`);

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
  /* El esquema del MESERO, no el del público: el suyo admite artículos
     libres (M-09) y cuenta con ellos al comprobar que el pedido no está
     vacío — una comanda de solo un descorche es un pedido legítimo aquí.
     El camino del cliente sigue parseando `createOrderSchema`, que ni
     siquiera conoce ese campo. */
  const parsed = waiterOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Datos del pedido inválidos.' };
  }

  const { restaurantId, items, customer, tipAccepted, clientId, openItems } = parsed.data;

  // Autenticación obligatoria (es mesero, no cliente anónimo).
  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const db = createServiceClient();

  /* «Enviar a cocina» es LA acción del turno, y cada consulta de aquí es una
     ida y vuelta de Render (Oregón) a la base (Virginia). Iban en fila —
     perfil, reintento, restaurante, precios, tema: cinco viajes antes de
     poder crear el pedido—. Ninguna depende de otra, así que salen juntas y
     se COMPRUEBAN en el mismo orden de siempre: nada se devuelve (ni el
     pedido de un reintento) antes de haber validado al mesero. */
  const [
    { data: waiterProfile },
    { data: existing },
    { data: restaurant },
    priced,
    { data: themeRow },
  ] = await Promise.all([
    db
      .from('profiles')
      .select('role, restaurant_id, permissions')
      .eq('id', user.id)
      .single(),
    // Reintento idempotente (fallback offline del mesero — hub local o cola
    // del dispositivo, ver waiter-panel.tsx): si este client_id ya generó un
    // pedido, se devuelve tal cual sin repetir push ni impresión (mismo
    // patrón que createOrder, migración 061).
    clientId
      ? db
          .from('orders')
          .select('id, order_number')
          .eq('restaurant_id', restaurantId)
          .eq('client_id', clientId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('restaurants')
      .select('id, modules, status, timezone')
      .eq('id', restaurantId)
      .single(),
    // Validar productos desde BD (precio autoritativo).
    verifyAndPriceItems(db, restaurantId, items),
    // Propina (si el restaurante la habilita para este tipo de pedido).
    db
      .from('restaurant_themes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .single(),
  ]);

  if (
    !waiterProfile ||
    waiterProfile.restaurant_id !== restaurantId ||
    !can(waiterProfile.role as string, waiterProfile.permissions as string[] | null, 'mesero')
  ) {
    return { error: 'No autorizado.' };
  }

  if (existing) {
    return { success: true, orderId: existing.id as string, orderNumber: existing.order_number as string };
  }

  if (!restaurant) return { error: 'Restaurante no encontrado.' };
  if (restaurant.status !== 'active') return { error: 'El restaurante no está disponible.' };

  const modules = restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders) return { error: 'Este restaurante no acepta pedidos.' };

  if ('error' in priced) return { error: priced.error };

  /* Y los que no están en la carta. Van DESPUÉS de los verificados para
     que salgan al final de la comanda: cocina lee primero lo que sabe
     hacer. Sin producto no hay costo, así que el margen de estas líneas
     queda vacío en vez de fingir un cero. */
  const verifiedItems: VerifiedOrderItem[] = [
    ...priced.items,
    ...openItems.map((o) => ({
      productId: null,
      name: o.name,
      price: o.price,
      cost: null,
      quantity: o.quantity,
      options: [],
      note: o.note,
      seat: o.seat ?? null,
    })),
  ];
  if (verifiedItems.length === 0) return { error: 'El pedido no tiene nada que enviar.' };

  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;

  /* Tipo de pedido del mesero: en mesa (DINE_IN) o para llevar (PICKUP).
     Antes estaba QUEMADO en 'DINE_IN', así que un pedido de mostrador se
     guardaba como si ocupara una mesa —y aparecía como tal en el plano del
     salón y en "liberar mesa"—. DELIVERY no se acepta por esta vía: exige
     dirección, zona y costo de envío que este panel no pide. */
  const waiterOrderType: 'DINE_IN' | 'PICKUP' = customer.type === 'PICKUP' ? 'PICKUP' : 'DINE_IN';

  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  // La propina se calcula con el tipo YA normalizado: si no, un cliente
  // manipulado podía mandar type: 'DELIVERY' y cobrar (o evitar) la propina
  // de un tipo de pedido distinto al que se guarda.
  const tip = computeTip(themeConfig, waiterOrderType, tipAccepted, subtotal);
  const total = Math.max(0, subtotal + tip);

  const address = waiterOrderType === 'DINE_IN' && customer.tableNumber !== undefined
    ? `Mesa ${customer.tableNumber}`
    : null;
  const notes = customer.coursePreference
    ? `[Servicio: ${customer.coursePreference}]${customer.notes ? ` · ${customer.notes}` : ''}`
    : (customer.notes ?? null);

  const { data: placed, error: orderError } = await db.rpc('place_order', {
    p_restaurant_id:  restaurantId,
    p_customer_name:  customer.name,
    p_customer_phone: customer.phone || '00000000',
    p_order_type:     waiterOrderType,
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
      note:             i.note || null,
      seat_no:          i.seat ?? null,
    })),
  });

  const order = placed as { id: string; order_number: string; public_token: string } | null;
  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  /* Cuánta gente se sentó. Va en un UPDATE aparte y no dentro de
     place_order a propósito: añadirle un parámetro al RPC crea una
     SOBRECARGA nueva y deja ambiguas las llamadas que no lo mandan (ver el
     aviso de la migración 031). Y si la columna todavía no existe en este
     entorno, el pedido ya está creado: perder el dato de personas no puede
     costar la comanda. */
  const personas =
    waiterOrderType === 'DINE_IN' && customer.partySize
      ? db.from('orders').update({ party_size: customer.partySize }).eq('id', order.id)
      : null;

  // El pedido del mesero NACE ya enviado a cocina.
  //
  // Antes nacía en NEW como los pedidos en línea, pero la comanda se imprimía
  // igual aquí mismo: el pedido quedaba en el panel con un botón "Confirmar"
  // que, al pulsarlo, VOLVÍA a mandar la comanda — dos papeles del mismo plato
  // (el bug de la doble impresión). Y no tenía sentido pedirle a nadie que
  // "confirmara" un pedido que un mesero del local ya tomó y ya mandó.
  // Ahora el estado dice la verdad desde el primer segundo: en preparación.
  //
  // Las dos escrituras (personas y estado) van a la vez: son filas iguales
  // pero columnas distintas, y siguen separadas por lo dicho arriba.
  const firedAt = new Date().toISOString();
  await Promise.all([
    personas,
    db
      .from('orders')
      .update({ status: 'PREP', accepted_at: firedAt })
      .eq('id', order.id),
  ]);

  /* Los artículos libres quedan por escrito (M-09). Es la contrapartida de
     dejar que el precio lo ponga una persona: no hay catálogo contra el que
     comprobarlo, así que lo que hay es un rastro con nombre, importe y quién
     lo apuntó. Sin bloquear el pedido si la bitácora falla. */
  if (openItems.length > 0) {
    const bitacora = logActivity({
      restaurantId,
      actorId: user.id,
      action: 'articulo_libre',
      entity: order.order_number,
      meta: {
        lineas: openItems.map((o) => ({ nombre: o.name, precio: o.price, cantidad: o.quantity })),
        total: openItems.reduce((sum, o) => sum + o.price * o.quantity, 0),
      },
    }).catch(() => {});
    after(() => bitacora);
  }

  notifyNewOrder(
    restaurantId,
    order,
    `${order.order_number} · ${customer.name} · ${address ?? 'Para llevar'}`,
    '🛎 Nuevo pedido (mesero)',
  );

  // Comanda a cocina vía el Agente de impresión del local. Best-effort: no-op
  // si el restaurante no tiene agente/destino de cocina configurado, y con
  // candado anti-duplicado (ver enqueueKitchenForOrder).
  //
  // Arranca YA (la comanda no se retrasa) pero el mesero no la espera: son
  // 5-6 consultas en fila (agente, estaciones, pedido, cabecera, candado,
  // cola) que antes se sumaban a su «Enviando…». `after` mantiene viva la
  // promesa hasta que termine aunque la respuesta ya se haya ido.
  const comanda = enqueueKitchenForOrder(restaurantId, order.id).catch(() => {
    // No bloquea el pedido del mesero si la impresión falla.
  });
  after(() => comanda);

  revalidarSalon();
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

/** Cómo pagó la mesa al cerrarse. */
export interface TablePayment {
  method: PaymentMethod;
  /**
   * Cuánto se paga con este método (M-11). Omitirlo significa «lo que
   * quede», que es el caso de siempre —toda la mesa de una forma— y por
   * eso sigue siendo opcional: ninguna de las llamadas que ya existían
   * tiene que cambiar para seguir cobrando como cobraba.
   */
  amount?: number | null;
  /** Lo que puso el cliente en efectivo, para dejar el vuelto por escrito.
      Solo se guarda con `method: 'CASH'`. */
  cashReceived?: number | null;
}

/* ════════════════════════════════════════════════════════════
   DESCUENTO Y CORTESÍA DE MESA (M-10)
   ------------------------------------------------------------
   `breakdown.discount` se pintaba en la cuenta desde siempre, pero solo
   podía llegar de un cupón del pedido público: el encargado no podía
   invitar un postre por una queja ni aplicar un 10 % de cumpleaños sin
   salirse del sistema. Y salirse del sistema significa, en la práctica,
   restar a mano en la calculadora y cobrar un número que no cuadra con
   nada de lo que queda escrito.

   Tres decisiones que sostienen esto:

   1. **Lo firma un encargado.** Es la MISMA regla que anular un plato ya
      cocinado (`puedeAprobar`, migración 079): quien no es mesero puro
      firma solo; un mesero le pasa la tablet a alguien de la lista y
      teclea su PIN. No hace falta un permiso nuevo ni una credencial
      nueva.
   2. **El motivo es obligatorio.** Un descuento sin motivo es un agujero
      en el arqueo con forma de función. Con motivo es una decisión que
      alguien tomó y que se puede leer después.
   3. **SUSTITUYE, no suma.** «10 %» aplicado dos veces por dos personas
      distintas no debe ser 20 %: el segundo recalcula sobre el consumo y
      deja el descuento en lo que dice. Aplicar 0 es quitarlo.

   La propina NO baja. Un plato anulado sí la baja (migración 124) porque
   nunca se sirvió; un descuento es comida que sí se sirvió y por la que
   se cobró menos por decisión del local — el mesero la trabajó igual.
   ════════════════════════════════════════════════════════════ */

export interface TableDiscountInput {
  restaurantId: string;
  tableNumber: number;
  /** 'percent' = sobre el consumo · 'amount' = un importe fijo. */
  kind: 'percent' | 'amount';
  /** 0 = quitar el descuento que hubiera. */
  value: number;
  reason: string;
  /** El encargado que autoriza, si quien lo aplica no puede firmar solo. */
  approverId?: string | null;
  approverPin?: string | null;
}

/** Lo que el diálogo de descuento necesita saber antes de pintarse. */
export async function getDiscountApproval(restaurantId: string): Promise<VoidApproval> {
  if (!restaurantId) return BLOQUEADO;
  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return BLOQUEADO;

  const db = createServiceClient();
  const { data: perfil } = await db
    .from('profiles').select('role, permissions').eq('id', acceso.actor.userId).maybeSingle();
  const selfApproves = puedeAprobar(
    perfil?.role as string | null,
    perfil?.permissions as string[] | null,
  );

  return {
    // Un descuento SIEMPRE necesita firma: no hay un caso «esto todavía no
    // ha salido a cocina» que lo haga inocuo, como en la anulación.
    required: true,
    selfApproves,
    approvers: selfApproves ? [] : await listarAprobadores(db, restaurantId),
  };
}

export async function applyTableDiscount(
  input: TableDiscountInput,
): Promise<{ error?: string; applied?: number }> {
  const { restaurantId, tableNumber, kind, value, reason } = input;
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };
  if (!Number.isFinite(value) || value < 0) return { error: 'El descuento no es un número válido.' };
  if (kind === 'percent' && value > 100) return { error: 'Un descuento no puede pasar del 100 %.' };

  const motivo = reason?.trim() ?? '';
  // Quitar el descuento también lleva motivo: es la misma decisión al revés.
  if (motivo.length < 3) return { error: 'Escribe el motivo del descuento.' };
  if (motivo.length > 200) return { error: 'El motivo es demasiado largo.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();

  /* Quién firma. Mismo camino que la anulación: si quien lo aplica es
     encargado firma él; si es un mesero, hace falta el PIN de alguien de
     la lista. */
  const { data: perfil } = await db
    .from('profiles').select('role, permissions').eq('id', acceso.actor.userId).maybeSingle();
  const firmaSolo = puedeAprobar(
    perfil?.role as string | null,
    perfil?.permissions as string[] | null,
  );
  let firmante = acceso.actor.userId;
  if (!firmaSolo) {
    if (!input.approverId || !input.approverPin) {
      return { error: 'Un descuento lo autoriza un encargado.' };
    }
    const v = await verificarAprobador(db, restaurantId, input.approverId, input.approverPin);
    if ('error' in v) return v;
    firmante = v.id;
  }

  const [colMesa, valMesa] = campoMesa(await hayColumnaMesa(), tableNumber);
  const { data: vivos, error: errLeer } = await db
    .from('orders')
    .select('id, subtotal, total, discount, loyalty_discount, coupon_id')
    .eq('restaurant_id', restaurantId)
    .eq(colMesa, valMesa)
    .eq('order_type', 'DINE_IN')
    .not('status', 'in', '("DELIVERED","CANCEL")');

  if (errLeer) return { error: errLeer.message };
  const pedidos = vivos ?? [];
  if (pedidos.length === 0) return { error: 'Esta mesa no tiene nada que descontar.' };

  /* Con cupón o puntos de por medio no se toca nada.
     ------------------------------------------------------------
     `orders.discount` es UNA columna y no distingue de dónde vino cada
     quetzal. Si esta mesa ya trae un cupón del menú público o un canje de
     puntos, sustituirlo aquí borraría ese descuento sin que nadie se
     entere — y el cliente ya lo vio aplicado en su pantalla. Antes que
     descuadrar dos cuentas a la vez, se dice que no y por qué. */
  const conCupon = pedidos.some((o) => o.coupon_id != null || Number(o.loyalty_discount ?? 0) > 0);
  if (conCupon) {
    return { error: 'Esta mesa ya trae un cupón o un canje de puntos. Cóbrala como está.' };
  }

  const consumo = pedidos.reduce((s, o) => s + Number(o.subtotal ?? 0), 0);
  if (consumo <= 0) return { error: 'Esta mesa no tiene consumo que descontar.' };

  const bruto = kind === 'percent' ? (consumo * value) / 100 : value;
  const monto = Math.min(Math.round(bruto * 100) / 100, consumo);

  /* Se reparte entre los pedidos vivos en proporción a lo que vale cada
     uno, y el ÚLTIMO se lleva lo que sobre del redondeo: sin eso, tres
     pedidos con un 33 % dejan un céntimo suelto que nadie cuadra. */
  let repartido = 0;
  for (let i = 0; i < pedidos.length; i++) {
    const o = pedidos[i];
    const previo = Number(o.discount ?? 0);
    const parte = i === pedidos.length - 1
      ? Math.round((monto - repartido) * 100) / 100
      : Math.round((monto * (Number(o.subtotal ?? 0) / consumo)) * 100) / 100;
    repartido = Math.round((repartido + parte) * 100) / 100;

    // El total se mueve por la DIFERENCIA con lo que ya tenía descontado:
    // así aplicar 10 % dos veces deja un 10 %, no un 20 %.
    const delta = Math.round((parte - previo) * 100) / 100;
    const { error } = await db
      .from('orders')
      .update({
        discount: parte,
        total: Math.max(0, Math.round((Number(o.total ?? 0) - delta) * 100) / 100),
      })
      .eq('id', o.id);
    if (error) return { error: error.message };
  }

  await logActivity({
    restaurantId,
    actorId: acceso.actor.userId,
    action: 'descuento_mesa',
    entity: String(tableNumber),
    meta: {
      tipo: kind,
      valor: value,
      monto,
      motivo,
      firmante,
      // Queda escrito si lo firmó otro: es la mitad del rastro.
      firmadoPorOtro: firmante !== acceso.actor.userId,
    },
  });

  revalidarSalon();
  return { applied: monto };
}

/**
 * Libera una mesa marcando como DELIVERED todos sus pedidos DINE_IN activos.
 * Solo el personal con permiso 'mesero' puede hacerlo.
 *
 * `payment` es cómo se pagó, y no es un adorno: hasta ahora TODO pedido de
 * mesa nacía con `payment_method: 'CASH'` escrito a mano y nadie lo volvía a
 * tocar, así que el arqueo de caja (lib/actions/finanzas.ts) contaba como
 * efectivo esperado también lo que se había pagado con tarjeta — y la caja
 * salía corta esa cantidad, todas las noches, sin nada que lo explicara.
 * Omitirlo deja los pedidos como estén (compatibilidad con quien llame sin
 * método); pasarlo lo escribe en los pedidos que se cierran.
 */
export async function freeTable(
  restaurantId: string,
  tableNumber: number,
  payment?: TablePayment | TablePayment[],
): Promise<{ error?: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  /* Uno o varios. Se admite el valor suelto de siempre porque media
     aplicación llama así —el salón, la caja, el cierre rápido— y M-11 no
     tiene por qué obligarlas a cambiar para cobrar de una sola forma. */
  const pagos = payment == null ? [] : Array.isArray(payment) ? payment : [payment];
  if (pagos.some((p) => !isPaymentMethod(p.method))) return { error: 'Forma de pago inválida.' };
  if (pagos.some((p) => p.amount != null && !(Number.isFinite(p.amount) && p.amount > 0))) {
    return { error: 'Importe de pago inválido.' };
  }

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const porNumero = await hayColumnaMesa();
  const [colMesa, valMesa] = campoMesa(porNumero, tableNumber);

  /* Los pedidos ANTES de cerrarlos: hace falta el total de cada uno para
     repartir el dinero entre ellos, y después del UPDATE ya no se pueden
     distinguir de los que se cerraron esta noche por otra vía. */
  const { data: vivos, error: errLeer } = await db
    .from('orders')
    .select('id, total, created_at')
    .eq('restaurant_id', restaurantId)
    .eq(colMesa, valMesa)
    .eq('order_type', 'DINE_IN')
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .order('created_at', { ascending: true });

  if (errLeer) return { error: errLeer.message };
  const ordenes = (vivos ?? []).map((o) => ({ id: o.id as string, total: Number(o.total ?? 0) }));

  /* Cómo se reparte el dinero entre los pedidos de la mesa (M-11).
     ------------------------------------------------------------
     Sin importe, un pago cubre lo que quede: es el caso de siempre —«toda
     la mesa en efectivo»— y así una sola llamada sigue significando lo
     mismo que antes de esta migración. Con importes, cada uno pone lo
     suyo y la aritmética vive en `lib/table-payments.ts`, probada aparte
     porque de aquí sale lo que el dueño cuenta en el cajón. */
  const totalMesa = ordenes.reduce((s, o) => s + o.total, 0);
  const puesto = pagos.reduce((s, p) => s + (p.amount ?? 0), 0);
  const entradas: PagoEntrada[] = pagos.map((p) => ({
    method: p.method,
    amount: p.amount ?? Math.max(0, totalMesa - puesto),
    cashReceived: p.method === 'CASH' ? p.cashReceived ?? null : null,
  }));
  const filas = repartirPagos(ordenes, entradas);

  /* Qué método se escribe en cada pedido. Sigue siendo UNA palabra por
     pedido —el ticket, los informes y analítica la leen así desde
     siempre— y es la del método que más puso. El detalle exacto está en
     `order_payments`. */
  const metodoDe = new Map<string, string>();
  const recibidoDe = new Map<string, number | null>();
  for (const o of ordenes) {
    const suyas = filas.filter((f) => f.orderId === o.id);
    if (suyas.length === 0) continue;
    metodoDe.set(o.id, metodoDominante(suyas));
    /* El efectivo recibido se guarda SOLO cuando de verdad cubre lo que
       se le aplicó: un "recibí" menor es un teclazo a medias, y dejarlo
       escrito haría que el ticket prometiera un vuelto que nadie dio. */
    const enEfectivo = suyas.filter((f) => f.method === 'CASH');
    const recibido = enEfectivo.find((f) => f.cashReceived != null)?.cashReceived ?? null;
    const aplicado = enEfectivo.reduce((s, f) => s + f.amount, 0);
    recibidoDe.set(o.id, recibido != null && recibido >= aplicado ? recibido : null);
  }

  const cierre: Record<string, unknown> = {
    status: 'DELIVERED',
    delivered_at: new Date().toISOString(),
  };

  /* Se cierran SOLO los pedidos que se leyeron arriba, y solo si siguen
     abiertos (PROD-07, auditoría de salida a producción). Antes se cerraba
     «todo lo abierto en la mesa en este momento»: una ronda que el mesero
     mandaba justo mientras caja cobraba quedaba cerrada sin pago, y dos
     aparatos cobrando a la vez registraban el pago dos veces. Lo que
     devuelve el `update` es lo que ESTA llamada cerró de verdad, y solo
     de eso se escribe el método y el detalle del pago. */
  let ids: string[] = [];
  if (ordenes.length > 0) {
    const { data: cerrados, error } = await db
      .from('orders')
      .update(cierre)
      .eq('restaurant_id', restaurantId)
      .in('id', ordenes.map((o) => o.id))
      .not('status', 'in', '("DELIVERED","CANCEL")')
      .select('id');

    if (error) return { error: error.message };
    ids = (cerrados ?? []).map((r) => r.id as string);
    // Otro aparato cobró la mesa entre la lectura y el cierre.
    if (ids.length === 0) return { error: 'Esta mesa ya se cobró.' };
  }
  const cerradosAqui = new Set(ids);

  for (const [orderId, metodo] of metodoDe) {
    if (!cerradosAqui.has(orderId)) continue;
    await db
      .from('orders')
      .update({ payment_method: metodo, cash_amount: recibidoDe.get(orderId) ?? null })
      .eq('id', orderId);
  }

  /* Y el detalle, fila por fila. Si la 129 todavía no corrió aquí, el
     cobro NO se cae: la mesa se cierra igual con su método dominante,
     que es exactamente lo que hacía antes de esta migración. */
  const filasCerradas = filas.filter((f) => cerradosAqui.has(f.orderId));
  if (filasCerradas.length > 0 && (await hayPagosDeMesa())) {
    await db.from('order_payments').insert(filasCerradas.map((f) => ({
      restaurant_id: restaurantId,
      order_id: f.orderId,
      method: f.method,
      amount: f.amount,
      cash_received: f.cashReceived,
      taken_by: acceso.actor.userId,
    })));
  }

  /* El reparto era de la gente que se acaba de ir: heredarlo a los
     próximos comensales mezclaría dos cuentas que no tienen nada que
     ver (migración 125). Si la tabla no existe todavía, no pasa nada. */
  await db.from('table_splits')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber);

  /* Y el turno se cierra aquí (migración 128). Cobrar es lo que vacía una
     mesa: si el turno siguiera abierto, la mesa quedaría «sentada» para
     siempre y el salón no se vaciaría nunca. */
  await cerrarTurnoDeMesa(restaurantId, tableNumber);

  // Una factura por pedido cerrado. En `after` para no dejar al mesero
  // esperando al certificador con la mesa ocupada en pantalla.
  if (ids.length > 0) {
    after(async () => {
      for (const id of ids) await emitirFacturaAutomatica(restaurantId, id);
    });
  }

  revalidarSalon();
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

  // CANCEL ya no pasa por aquí: exige motivo + (si ya se envió a cocina)
  // aprobación de encargado — ver voidOrder(). Sin este candado, cualquier
  // botón nuevo podía reintroducir la cancelación silenciosa sin auditoría.
  if (status === 'CANCEL') {
    return { error: 'Para anular un pedido usa el flujo de anulación (requiere motivo).' };
  }

  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'No autorizado.' };

  const validRoles = ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'];
  if (!validRoles.includes(profile.role)) return { error: 'No autorizado.' };

  // Quien administra un grupo usa el cliente con RLS: la política de la
  // migración 053 —desde la 116 sin mirar el rol— limita la actualización a
  // pedidos de sucursales de su organización. Con el cliente de servicio no
  // habría filtro por sucursal ninguno.
  const db = profile.role === 'SUPER_ADMIN' ? createServiceClient() : supabase;

  // Sella la marca de tiempo de la transición (analítica de tiempos). CANCEL
  // ya no pasa por aquí (ver guard arriba) — restock_order y cancelled_at los
  // maneja voidOrder()/void_order() en su propia transacción.
  const now = new Date().toISOString();
  const stamp: Record<string, string> =
    status === 'PREP'      ? { accepted_at: now }
    : status === 'READY'     ? { ready_at: now }
    : status === 'SERVED'    ? { served_at: now }
    : status === 'DELIVERED' ? { delivered_at: now }
    : {};

  // Transición ATÓMICA: el `.neq('status', status)` hace que un pedido que YA
  // está en ese estado no se toque y devuelva 0 filas. Es lo que evita que dos
  // personas pulsando a la vez ("Confirmar" en el panel y "Comenzar" en la
  // pantalla de cocina) disparen dos veces los efectos de la transición — en
  // particular, dos comandas del mismo pedido.
  const { data: changedRows, error } = await db
    .from('orders')
    .update({ status, ...stamp })
    .eq('id', orderId)
    .neq('status', status)
    .select('id, restaurant_id');

  if (error) return { error: error.message };

  const changed = (changedRows?.length ?? 0) > 0;
  /* El restaurante es SIEMPRE el del pedido, nunca `profile.restaurant_id`:
     ese es el restaurante «de casa», null para quien se registró solo y
     otro distinto para quien opera su segundo local o ayuda en otra
     sucursal. Con él, la comanda, los puntos y la factura se buscaban en
     el restaurante equivocado y se callaban, y la bitácora no se escribía
     (PROD-08, auditoría de salida a producción). */
  const rowRestaurantId = (changedRows?.[0]?.restaurant_id as string | undefined) ?? null;

  // Al enviar a cocina (→PREP): encola la comanda al agente de impresión del
  // restaurante (funciona desde cualquier dispositivo, incl. móvil). Solo si la
  // fila REALMENTE cambió de estado en esta llamada. No-op si no hay agente
  // configurado; best-effort, no debe romper el cambio de estado.
  if (status === 'PREP' && changed && rowRestaurantId) {
    try {
      await enqueueKitchenForOrder(rowRestaurantId, orderId);
    } catch {
      /* impresión es best-effort */
    }
  }

  // Acumula puntos de lealtad al entregar (best-effort; no-op si el módulo está
  // inactivo o el pedido no tiene cliente). No debe romper el cambio de estado.
  // SERVED cuenta aquí porque freeTable() (cierre manual de mesa DINE_IN) bypasea
  // esta función y nunca llega a otorgar puntos vía DELIVERED.
  if ((status === 'DELIVERED' || status === 'SERVED') && changed && rowRestaurantId) {
    try {
      await awardLoyaltyForOrder(rowRestaurantId, orderId);
    } catch {
      /* best-effort */
    }
  }

  // Factura electrónica al cerrar la venta (migración 118). Va en `after`
  // y no en línea: hablar con el certificador puede tardar hasta 20s y esta
  // acción la pulsa el personal decenas de veces al día — la caja no puede
  // quedarse esperando al SAT. Tampoco se suelta la promesa sin más, que
  // moriría al terminar la request.
  //
  // No-op si el módulo está inactivo, si el dueño apagó la emisión
  // automática o si faltan datos fiscales. Nunca lanza: una venta ya
  // cobrada no se revierte porque el certificador tuviera un mal día.
  if ((status === 'DELIVERED' || status === 'SERVED') && changed && rowRestaurantId) {
    after(() => emitirFacturaAutomatica(rowRestaurantId, orderId));
  }

  // Aviso al comensal por WhatsApp (Fase 1A). Con `after` y no await: el
  // envío puede tardar hasta 10s contra Meta y esta acción la ejecuta el
  // personal decenas de veces al día — no puede quedarse esperando. Tampoco
  // sirve dispararlo y olvidarlo: una promesa suelta puede morir cuando
  // termina la request. `after` corre el trabajo DESPUÉS de responder.
  // No-op si el restaurante no tiene número conectado.
  if (changed) {
    after(() => notifyOrderStatus(orderId, status));
  }

  if (changed && rowRestaurantId) {
    logActivity({
      restaurantId: rowRestaurantId,
      actorId: user.id,
      action: 'order_status',
      entity: status,
      meta: { orderId },
    });
  }

  revalidarSalon();
  return {};
}

export interface VoidOrderInput {
  orderId: string;
  /** null/omitido = anular el pedido COMPLETO; si no, el order_item puntual. */
  itemId?: string | null;
  /** Requerido junto con itemId: cuántas unidades de esa línea se anulan. */
  quantity?: number | null;
  reason: string;
  /** El encargado que autoriza, cuando quien anula no puede firmar solo. */
  approverId?: string | null;
  approverPin?: string | null;
}

/** Lo que el diálogo de anulación necesita saber antes de pintarse. */
export interface VoidApproval {
  /** Ya salió a cocina: hace falta una firma. */
  required: boolean;
  /** Quien está anulando puede firmar solo (no es mesero puro). */
  selfApproves: boolean;
  /** A quién puede pasarle la tablet. Vacío = nadie tiene PIN puesto. */
  approvers: Aprobador[];
}

/* Si no se puede averiguar quién firma —sesión caída, pedido que no
   existe, alguien de otro restaurante—, se responde lo MÁS cerrado: hace
   falta firma y no hay nadie que pueda darla. La comprobación de verdad
   está en `voidOrder`, pero un fallo aquí no debe pintar un diálogo que
   parezca decir «adelante, esto no necesita permiso». */
const BLOQUEADO: VoidApproval = { required: true, selfApproves: false, approvers: [] };

/**
 * Quién puede firmar la anulación de ESTE pedido.
 *
 * Recibe el pedido y no el restaurante a propósito: el diálogo siempre
 * tiene el `orderId` a mano, y así el restaurante lo resuelve el servidor
 * en vez de venir del cliente, que es quien no debería decidirlo.
 *
 * La lista solo trae a quien tiene PIN puesto: es la de quien puede
 * autorizar AHORA, no la de quien podría en teoría. Y solo nombre y cargo,
 * los mismos datos que ya enseña la pantalla de entrar con PIN.
 */
export async function getVoidApproval(orderId: string): Promise<VoidApproval> {
  if (!orderId) return BLOQUEADO;
  const { data: { user } } = await getStaffUser();
  if (!user) return BLOQUEADO;

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders').select('restaurant_id, status').eq('id', orderId).maybeSingle();
  if (!order) return BLOQUEADO;
  const restaurantId = order.restaurant_id as string;

  // Quien pregunta tiene que ser del local: la lista de encargados no es
  // pública aunque solo lleve nombres.
  const { data: quien } = await db
    .from('profiles').select('role, restaurant_id, permissions').eq('id', user.id).maybeSingle();
  if (!quien) return BLOQUEADO;
  const suyo = await resolveEffectiveRole(
    { role: (quien.role as string | null) ?? null, permissions: (quien.permissions as string[] | null) ?? null },
    restaurantId,
  );
  if (!suyo.isMember && quien.restaurant_id !== restaurantId && !(await canActOnGroupBranch(restaurantId))) {
    return BLOQUEADO;
  }

  const required = necesitaAprobacion(order.status as string);
  const selfApproves = puedeAprobar(quien.role as string | null, quien.permissions as string[] | null);
  if (!required || selfApproves) return { required, selfApproves, approvers: [] };

  return { required, selfApproves, approvers: await listarAprobadores(db, restaurantId) };
}

/* `listarAprobadores` y `verificarAprobador` se mudaron a
   `lib/auth/firma-encargado.ts`: desde la migración 145 también firman las
   correcciones de caja, y este archivo es `'use server'` — exportarlas desde
   aquí las publicaría como acciones. */

/**
 * Anula un pedido completo o N unidades de un ítem, con motivo obligatorio.
 * Reemplaza el cancel directo sin auditoría que antes hacía
 * updateOrderStatus(id, 'CANCEL').
 */
export async function voidOrder(input: VoidOrderInput): Promise<{ error?: string; success?: boolean }> {
  const reason = input.reason?.trim();
  if (!reason) return { error: 'El motivo es obligatorio.' };
  if (!input.orderId) return { error: 'Pedido inválido.' };

  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data: requester } = await db
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();
  if (!requester) return { error: 'No autorizado.' };

  const { data: order } = await db
    .from('orders')
    .select('id, restaurant_id, status')
    .eq('id', input.orderId)
    .single();
  if (!order) return { error: 'Pedido no encontrado.' };

  const efectivo = await resolveEffectiveRole(
    { role: (requester.role as string | null) ?? null, permissions: (requester.permissions as string[] | null) ?? null },
    order.restaurant_id as string,
  );
  const ownsBranch = (await canActOnGroupBranch(order.restaurant_id))
    || efectivo.isMember
    || requester.restaurant_id === order.restaurant_id;
  if (
    !ownsBranch ||
    !can(efectivo.role, efectivo.permissions, 'mesero')
  ) {
    return { error: 'No autorizado.' };
  }
  if (order.status === 'CANCEL' || order.status === 'DELIVERED') {
    return { error: 'Este pedido ya está cerrado.' };
  }

  /* ── La firma del encargado (hallazgo F-06) ──────────────────
     `approvedBy` estaba fijado a `null` en el código: la columna que la
     migración 079 creó para esto no se llenaba nunca y cualquiera con
     permiso de mesero podía quitar de la cuenta un plato ya cocinado sin
     que nadie más se enterara.

     Lo que aún no salió a cocina se sigue anulando solo —corregirse al
     escribir la comanda no es descuadrar nada—; lo demás necesita a
     alguien que firme. Si quien anula YA es encargado, firma él: no se le
     pide un PIN para autorizarse a sí mismo, pero su id queda escrito, que
     es lo que faltaba. */
  let approvedBy: string | null = null;

  if (necesitaAprobacion(order.status as string)) {
    if (puedeAprobar(requester.role as string | null, requester.permissions as string[] | null)) {
      approvedBy = user.id;
    } else if (input.approverId && input.approverPin) {
      const firma = await verificarAprobador(
        db, order.restaurant_id as string, input.approverId, input.approverPin,
      );
      if ('error' in firma) return { error: firma.error };
      approvedBy = firma.id;
    } else {
      return { error: 'Esto ya salió a cocina: hace falta que lo autorice un encargado con su PIN.' };
    }
  }

  if (input.itemId) {
    const qty = Math.trunc(input.quantity ?? 0);
    if (qty < 1) return { error: 'Cantidad inválida.' };
    const { error } = await db.rpc('void_order_item', {
      p_order_item_id: input.itemId,
      p_order_id: order.id,
      p_quantity: qty,
      p_reason: reason,
      p_requested_by: user.id,
      p_approved_by: approvedBy,
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await db.rpc('void_order', {
      p_order_id: order.id,
      p_reason: reason,
      p_requested_by: user.id,
      p_approved_by: approvedBy,
    });
    if (error) return { error: error.message };
  }

  logActivity({
    restaurantId: order.restaurant_id as string,
    actorId: user.id,
    action: 'order_void',
    entity: reason,
    meta: { orderId: order.id, itemId: input.itemId ?? null, approvedBy },
  });

  revalidarSalon();
  return { success: true };
}

/* El guardián de la mesa se mudó a `lib/auth/table-access.ts`: desde la
   migración 128 lo comparten las acciones de pedido y las de sentar, y
   exportarlo desde un archivo 'use server' lo habría publicado como una
   acción más. La regla no cambió ni una línea. */

/** Todos los pedidos activos de una mesa (todas las rondas acumuladas),
 *  base de la "cuenta de mesa" / dividir cuenta en el panel de mesero. */
export async function getTableBill(
  restaurantId: string,
  tableNumber: number,
): Promise<{ orders: OrderWithItems[] } | { error: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  return { orders: await getOrdersForTable(restaurantId, tableNumber) };
}

/* ════════════════════════════════════════════════════════════
   LA ÚNICA ACCIÓN DE UNA FICHA DE MESA
   ------------------------------------------------------------
   El rediseño del salón cambia el trato: una mesa no ofrece un menú
   de opciones, ofrece lo que toca hacer AHORA. Dos de esos verbos se
   resuelven aquí mismo, sin sacar a nadie de la pantalla:

     · «Llevar a la mesa» — la comida está lista en la barra.
     · «Atender»          — alguien llamó y ya va para allá.

   Los demás (cobrar, agregar, abrir) sí llevan al panel de mesero,
   que es donde vive el pedido: duplicar ahí la lógica de cobro sería
   una segunda verdad sobre la misma mesa.
   ════════════════════════════════════════════════════════════ */

/**
 * Marca como servidos los platos que ya estaban listos en una mesa.
 *
 * Es «Llevar a la mesa»: lo que había en la barra enfriándose ya está
 * puesto. Solo toca los pedidos en READY — lo que sigue en cocina no se
 * puede haber servido.
 */
export async function serveTableReady(
  restaurantId: string,
  tableNumber: number,
): Promise<{ error?: string; served?: number; ids?: string[] }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const [colMesa, valMesa] = campoMesa(await hayColumnaMesa(), tableNumber);
  const { data, error } = await db
    .from('orders')
    .update({ status: 'SERVED', served_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq(colMesa, valMesa)
    .eq('status', 'READY')
    .select('id');

  if (error) return { error: error.message };

  revalidarSalon();
  /* Se devuelven los ids, y no solo cuántos, para poder DESHACER: sin
     ellos el «deshacer» tendría que adivinar qué pedidos tocó esta
     llamada y podría revertir uno que cocina acaba de marcar. */
  const ids = (data ?? []).map((r) => r.id as string);
  return { served: ids.length, ids };
}

/** Cuántas filas puede revertir un deshacer. Una mesa no acumula más. */
const MAX_DESHACER = 50;

/**
 * Deshace un «Llevar a la mesa».
 *
 * «Servido» se marca de UN toque desde una ficha del salón, en una rejilla
 * que se reordena sola: acertar en la mesa de al lado deja un plato dado
 * por servido, arranca el reloj de «sin cobrar» sobre comida que sigue en
 * la barra, y hasta ahora lo único que quedaba era un aviso de cuatro
 * segundos sin salida.
 *
 * Solo revierte lo que sigue EXACTAMENTE como lo dejó la acción
 * (`status = SERVED`): si mientras tanto la mesa se cobró o cocina movió
 * el pedido, deshacer sería pisar un cambio más nuevo, así que esa fila se
 * queda como está.
 */
export async function undoServeTable(
  restaurantId: string,
  orderIds: string[],
): Promise<{ error?: string; undone?: number }> {
  if (!restaurantId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return { error: 'Datos inválidos.' };
  }
  if (orderIds.length > MAX_DESHACER) return { error: 'Demasiados pedidos que deshacer.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data, error } = await db
    .from('orders')
    .update({ status: 'READY', served_at: null })
    .eq('restaurant_id', restaurantId)
    .in('id', orderIds)
    .eq('status', 'SERVED')
    .select('id');

  if (error) return { error: error.message };

  revalidarSalon();
  return { undone: data?.length ?? 0 };
}

/**
 * Da por atendidas las llamadas pendientes de una mesa.
 *
 * Es «Atender»: el aviso desaparece del salón porque alguien ya va. No
 * cambia nada del pedido — una llamada no es un estado de la comida.
 */
export async function resolveTableCalls(
  restaurantId: string,
  tableNumber: number,
): Promise<{ error?: string; resolved?: number; ids?: string[] }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data, error } = await db
    .from('waiter_calls')
    .update({ resolved_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('resolved_at', null)
    .select('id');

  if (error) return { error: error.message };

  revalidarSalon();
  const ids = (data ?? []).map((r) => r.id as string);
  return { resolved: ids.length, ids };
}

/**
 * Deshace un «Atender».
 *
 * «Atender» da por resueltas TODAS las llamadas pendientes de la mesa —
 * incluida la que entró mientras el mesero iba caminando—, y es también
 * un toque desde una ficha. Devolverlas a pendiente es lo único que hace
 * que equivocarse de mesa no borre a alguien que sigue con la mano
 * levantada.
 *
 * Igual que el otro deshacer, solo toca lo que sigue resuelto: si el
 * comensal volvió a llamar, esa llamada es nueva y no se toca.
 */
export async function undoResolveTableCalls(
  restaurantId: string,
  callIds: string[],
): Promise<{ error?: string; undone?: number }> {
  if (!restaurantId || !Array.isArray(callIds) || callIds.length === 0) {
    return { error: 'Datos inválidos.' };
  }
  if (callIds.length > MAX_DESHACER) return { error: 'Demasiadas llamadas que deshacer.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data, error } = await db
    .from('waiter_calls')
    .update({ resolved_at: null })
    .eq('restaurant_id', restaurantId)
    .in('id', callIds)
    .not('resolved_at', 'is', null)
    .select('id');

  if (error) return { error: error.message };

  revalidarSalon();
  return { undone: data?.length ?? 0 };
}

/**
 * Cuánta gente hay sentada en la mesa (migración 123).
 *
 * Se guarda en TODOS los pedidos activos de la mesa, no solo en el
 * último: la mesa es una sola y la cifra tiene que decir lo mismo se
 * mire desde la comanda que se mire.
 */
export async function setTableParty(
  restaurantId: string,
  tableNumber: number,
  partySize: number | null,
): Promise<{ error?: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };
  if (partySize != null && (!Number.isInteger(partySize) || partySize < 1 || partySize > 100)) {
    return { error: 'Número de personas inválido.' };
  }

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const [colMesa, valMesa] = campoMesa(await hayColumnaMesa(), tableNumber);
  const { error } = await db
    .from('orders')
    .update({ party_size: partySize })
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq(colMesa, valMesa)
    .not('status', 'in', '("DELIVERED","CANCEL")');

  // La columna es de la migración 123: donde no ha corrido, anotar las
  // personas no debe romper la pantalla — simplemente no se guarda.
  if (error) {
    if (faltaLaColumna(error)) return { error: 'Falta la migración 123 para poder anotar las personas.' };
    return { error: error.message };
  }

  revalidarSalon();
  return {};
}

/**
 * Mueve lo que hay en una mesa a otra.
 *
 * Cubre las dos cosas que pasan de verdad en un salón y que hasta ahora
 * obligaban a anular y volver a apuntar:
 *
 *   · «Mover a otra»  — se cambiaron de mesa. El destino está libre.
 *   · «Juntar mesas»  — llegaron dos más y se corren las mesas. El
 *                       destino YA tiene gente, y eso es lo que se
 *                       quiere: una sola cuenta.
 *
 * `merge` distingue las dos: sin él, mover a una mesa ocupada juntaría
 * dos cuentas ajenas por un dedazo, que es de las peores cosas que
 * pueden pasar en una noche llena.
 */
export async function moveTableOrders(
  restaurantId: string,
  from: number,
  to: number,
  merge = false,
): Promise<{ error?: string; moved?: number }> {
  if (!restaurantId || !from || !to) return { error: 'Datos inválidos.' };
  if (from === to) return { error: 'Es la misma mesa.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const activos = '("DELIVERED","CANCEL")';

  const porNumero = await hayColumnaMesa();
  const [colDestino, valDestino] = campoMesa(porNumero, to);
  const { count: ocupada } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq(colDestino, valDestino)
    .not('status', 'in', activos);

  if ((ocupada ?? 0) > 0 && !merge) {
    return { error: `La mesa ${to} ya tiene gente. Usa «Juntar mesas» si quieres una sola cuenta.` };
  }

  /* Se escriben LAS DOS: el número es la identidad y la dirección es lo
     que se imprime en el ticket. Dejar solo una las descuadraría. */
  const mudanza: Record<string, unknown> = { address: direccionDeMesa(to) };
  if (porNumero) mudanza.table_number = to;
  const [colOrigen, valOrigen] = campoMesa(porNumero, from);
  const { data, error } = await db
    .from('orders')
    .update(mudanza)
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq(colOrigen, valOrigen)
    .not('status', 'in', activos)
    .select('id');

  if (error) return { error: error.message };
  if ((data?.length ?? 0) === 0) return { error: `La mesa ${from} no tiene nada que mover.` };

  /* Las llamadas pendientes se van con la mesa: si pidieron la cuenta en
     la 3 y se pasaron a la 7, el aviso tiene que seguirlos. */
  await db
    .from('waiter_calls')
    .update({ table_number: to })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', from)
    .is('resolved_at', null);

  revalidarSalon();
  return { moved: data?.length ?? 0 };
}

/* ════════════════ EL REPARTO DE LA CUENTA ════════════════
   Cómo se divide una mesa y quién ya pagó (migración 125).

   Vivía en el `localStorage` del aparato que estuviera cobrando, así
   que no existía para nadie más: el mesero empezaba el cobro en su
   teléfono y el cajero, en la tablet, veía la cuenta entera sin
   cobrar. Ahora es una fila por mesa, compartida por el local, que se
   borra sola al cerrar la mesa.

   Es un borrador de trabajo, no contabilidad: lo cobrado de verdad
   son `orders.payment_method` y `orders.total`, que escribe
   `freeTable`.                                                      */

/** Una persona del reparto. El nombre es opcional («Persona 2»). */
export interface SplitPerson { id: string; name?: string }

export interface TableSplit {
  mode: 'single' | 'equal' | 'byItem';
  people: SplitPerson[];
  /** order_item_id → ids de comensales. Ausente = sin asignar. */
  assignment: Record<string, string[]>;
  paid: string[];
  /** Cuándo se guardó por última vez, para poder decir quién va ganando. */
  updatedAt: string | null;
}

const SPLIT_MODES = ['single', 'equal', 'byItem'] as const;

/** Recorta lo que llega del cliente a algo que quepa en una fila y no
    pueda crecer sin límite: son datos que escribe un navegador. */
function sanitizeSplit(raw: unknown): Omit<TableSplit, 'updatedAt'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  const mode = (SPLIT_MODES as readonly string[]).includes(s.mode as string)
    ? (s.mode as TableSplit['mode'])
    : 'single';

  const people = Array.isArray(s.people)
    ? s.people
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .slice(0, 30)
      .map((p) => {
        const id = String(p.id ?? '').slice(0, 12);
        const name = typeof p.name === 'string' ? p.name.trim().slice(0, 24) : '';
        return name ? { id, name } : { id };
      })
      .filter((p) => p.id)
    : [];

  const ids = new Set(people.map((p) => p.id));
  const assignment: Record<string, string[]> = {};
  if (s.assignment && typeof s.assignment === 'object') {
    for (const [itemId, v] of Object.entries(s.assignment as Record<string, unknown>).slice(0, 400)) {
      if (!Array.isArray(v)) continue;
      // Solo personas que existen: un id huérfano descuadraría el cobro
      // en silencio, que es justo lo que se venía arreglando.
      const claim = v.map(String).filter((id) => ids.has(id));
      if (claim.length > 0) assignment[itemId.slice(0, 64)] = claim;
    }
  }

  const paid = Array.isArray(s.paid)
    ? [...new Set(s.paid.map(String).filter((id) => ids.has(id) || id === 'mesa'))].slice(0, 31)
    : [];

  return { mode, people, assignment, paid };
}

/** El reparto guardado de una mesa. `null` = todavía no hay ninguno. */
export async function getTableSplit(
  restaurantId: string,
  tableNumber: number,
): Promise<{ split: TableSplit | null } | { error: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data, error } = await db
    .from('table_splits')
    .select('mode, people, assignment, paid, updated_at')
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .maybeSingle();

  /* Donde la migración 125 todavía no corrió, la tabla no existe. Eso no
     puede tumbar el cobro: se devuelve "no hay reparto" y la pantalla
     sigue funcionando con el suyo en memoria. (Mismo criterio que
     `party_size` en getActiveTableNumbers.) */
  if (error) {
    if (faltaLaTabla(error)) return { split: null };
    return { error: error.message };
  }
  if (!data) return { split: null };

  const limpio = sanitizeSplit(data);
  return {
    split: limpio
      ? { ...limpio, updatedAt: (data.updated_at as string | null) ?? null }
      : null,
  };
}

/** Guarda el reparto en curso de una mesa. */
export async function saveTableSplit(
  restaurantId: string,
  tableNumber: number,
  raw: unknown,
): Promise<{ error?: string; savedAt?: string }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const split = sanitizeSplit(raw);
  if (!split) return { error: 'Reparto inválido.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const savedAt = new Date().toISOString();
  const { error } = await db
    .from('table_splits')
    .upsert({
      restaurant_id: restaurantId,
      table_number: tableNumber,
      mode: split.mode,
      people: split.people,
      assignment: split.assignment,
      paid: split.paid,
      updated_at: savedAt,
      updated_by: acceso.actor.userId,
    }, { onConflict: 'restaurant_id,table_number' });

  if (error) {
    if (faltaLaTabla(error)) return {};
    return { error: error.message };
  }
  return { savedAt };
}

/**
 * Reasigna el asiento de una línea del pedido (migración 123).
 *
 * Es lo que convierte «dividir la cuenta» en algo ya hecho: si cada
 * plato sabe de quién es desde que se pide, cobrar por separado deja de
 * ser un rompecabezas al final de la noche.
 */
export async function setItemSeat(
  restaurantId: string,
  itemId: string,
  seatNo: number | null,
): Promise<{ error?: string }> {
  if (!restaurantId || !itemId) return { error: 'Datos inválidos.' };
  if (seatNo != null && (!Number.isInteger(seatNo) || seatNo < 1 || seatNo > 40)) {
    return { error: 'Asiento inválido.' };
  }

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  // El ítem tiene que ser de un pedido de ESTE restaurante: sin esta
  // comprobación, un id de línea ajeno sería editable desde aquí.
  const { data: item } = await db
    .from('order_items')
    .select('id, order:orders!inner(restaurant_id)')
    .eq('id', itemId)
    .maybeSingle();
  const dueño = (item as { order?: { restaurant_id: string } | null } | null)?.order?.restaurant_id;
  if (!item || dueño !== restaurantId) return { error: 'Plato no encontrado.' };

  const { error } = await db.from('order_items').update({ seat_no: seatNo }).eq('id', itemId);
  if (error) {
    if (faltaLaColumna(error)) return { error: 'Falta la migración 123 para poder repartir por asiento.' };
    return { error: error.message };
  }

  revalidarSalon();
  return {};
}

export interface PrintBillShareInput {
  restaurantId: string;
  tableNumber: number;
  mode: SplitMode;
  peopleIds: string[];
  /** id de comensal → nombre escrito por el mesero (opcional). */
  names: Record<string, string>;
  assignment: BillAssignment;
  /** null = la cuenta completa de la mesa; UNASSIGNED_ID = lo no reclamado. */
  personId: string | null;
}

/**
 * Imprime en la impresora de caja el ticket de un comensal (o de la mesa
 * completa). El reparto se RECALCULA aquí desde los pedidos reales: el cliente
 * manda la asignación, nunca los montos — así lo impreso siempre cuadra con lo
 * que la mesa debe, aunque la pantalla se haya quedado con datos viejos.
 */
export async function printTableBillShare(
  input: PrintBillShareInput,
): Promise<{ error?: string; ok?: boolean }> {
  const { restaurantId, tableNumber, mode, peopleIds, names, assignment, personId } = input;
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const orders = await getOrdersForTable(restaurantId, tableNumber);
  if (orders.length === 0) return { error: 'Esta mesa no tiene pedidos activos.' };

  const lines = buildBillLines(orders);
  const split = computeSplit({ orders, mode, peopleIds, assignment });
  const label = (id: string) =>
    id === UNASSIGNED_ID ? 'Sin asignar' : (names[id]?.trim() || `Persona ${id}`);

  // Cuenta completa de la mesa: un solo ticket con todo.
  if (personId === null || mode === 'single') {
    return finishTicket({
      restaurantId, tableNumber, personLabel: null, positionLabel: null,
      lines: lines.filter((l) => l.quantity > 0).map((l) => ({
        quantity: l.quantity, name: l.name, options: l.options, amount: l.lineTotal,
      })),
      items: split.breakdown.items,
      extras: split.breakdown.extras,
      total: split.breakdown.grandTotal,
    });
  }

  const share = personId === UNASSIGNED_ID
    ? split.unassigned
    : split.people.find((p) => p.personId === personId);
  if (!share) return { error: 'Ese comensal ya no está en la cuenta.' };

  // En partes iguales no hay platos "de" nadie: el ticket lleva el consumo de
  // la mesa como referencia y el total ya dividido.
  const ticketLines = mode === 'equal'
    ? []
    : lines
      .filter((l) => {
        if (l.quantity === 0) return false;
        const claimed = (assignment[l.itemId] ?? []).filter((id) => peopleIds.includes(id));
        return personId === UNASSIGNED_ID ? claimed.length === 0 : claimed.includes(personId);
      })
      .map((l) => {
        const claimed = (assignment[l.itemId] ?? []).filter((id) => peopleIds.includes(id));
        const sharedWith = Math.max(1, claimed.length);
        return {
          quantity: l.quantity,
          name: l.name,
          options: l.options,
          amount: Math.round((l.lineTotal / sharedWith) * 100) / 100,
          sharedWith,
        };
      });

  const position = split.people.findIndex((p) => p.personId === personId);
  return finishTicket({
    restaurantId,
    tableNumber,
    personLabel: label(personId),
    positionLabel: mode === 'equal'
      ? `Parte ${position + 1} de ${peopleIds.length} · partes iguales`
      : position >= 0 ? `Persona ${position + 1} de ${peopleIds.length}` : null,
    lines: ticketLines,
    items: share.items,
    extras: share.extras,
    total: share.total,
  });
}

async function finishTicket(t: {
  restaurantId: string;
  tableNumber: number;
  personLabel: string | null;
  positionLabel: string | null;
  lines: { quantity: number; name: string; options: string | null; amount: number; sharedWith?: number }[];
  items: number;
  extras: number;
  total: number;
}): Promise<{ error?: string; ok?: boolean }> {
  const res = await enqueueSplitBillTicket({
    ...t,
    extrasLabel: t.extras < 0 ? 'Descuentos' : 'Propina y cargos',
  });
  if ('error' in res) {
    return {
      error: res.error.startsWith('No hay impresora')
        ? 'No hay impresora de caja asignada. Configúrala en Mi PC del local.'
        : res.error,
    };
  }
  return { ok: true };
}

/**
 * Cancela (con reposición de stock) los pedidos DINE_IN de ESTE restaurante
 * con más de 24h sin cerrar — botón manual de respaldo del panel (el cron
 * de la migración 080 ya lo hace solo cada hora si pg_cron está disponible).
 */
export async function archiveAbandonedTables(restaurantId: string): Promise<{ error?: string; archived?: number }> {
  if (!restaurantId) return { error: 'Restaurante inválido.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;
  const { actor } = acceso;

  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_archive_abandoned_orders', { p_restaurant_id: restaurantId });
  if (error) return { error: error.message };

  const archived = (data as number) ?? 0;
  if (archived > 0) {
    // El super admin no tiene restaurante propio: se apunta el que se archivó,
    // que es el dato que le sirve a quien lea la bitácora.
    logActivity({ restaurantId, actorId: actor.userId, action: 'auto_archive', entity: `${archived} ${archived === 1 ? 'mesa' : 'mesas'}` });
  }

  revalidarSalon();
  return { archived };
}

/** Comprueba que quien llama puede operar sobre este pedido; devuelve su
 *  restaurant_id. Compartido por las acciones de impresión del panel. */
async function authorizeOrderAccess(
  orderId: string,
): Promise<{ restaurantId: string } | { error: string }> {
  if (!orderId) return { error: 'ID de pedido requerido.' };

  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
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
      (await canActOnRestaurant(profile.restaurant_id, order.restaurant_id))) ||
    (await canActOnGroupBranch(order.restaurant_id));
  if (!allowed) return { error: 'No autorizado.' };

  return { restaurantId: order.restaurant_id as string };
}

/** Mensaje humano para un intento de impresión que no llegó a la cola. */
function printFailureMessage(
  reason: 'no-printer' | 'pc-off' | 'not-found' | 'error' | 'already-printed' | 'sin-lineas',
  role: 'cocina' | 'caja',
  message?: string,
): string {
  switch (reason) {
    case 'no-printer':
      return `No hay impresora de ${role} asignada. Configúrala en «Mi PC del local».`;
    case 'sin-lineas':
      // Se pidió reimprimir una estación concreta y el pedido no tiene ni
      // una línea suya. Pasa si alguien cambió el mapa entre que salió el
      // papel y se pulsó «Reintentar».
      return 'Ese pedido ya no tiene platos de esa estación.';
    case 'pc-off':
      return 'La PC principal del local está apagada: enciéndela en «Mi PC del local» para poder imprimir.';
    case 'not-found':
      return 'El pedido ya no existe.';
    case 'already-printed':
      return 'Esa comanda ya se envió a cocina.';
    default:
      return message ?? 'No se pudo enviar a la impresora.';
  }
}

/**
 * Encola el recibo de caja de un pedido al agente de impresión del restaurante.
 * Lo llama el botón "Imprimir recibo" cuando el restaurante usa el Agente Leogin
 * (en vez de la impresión por navegador).
 *
 * Devuelve el error real: antes, sin impresora de caja asignada o con la PC
 * principal apagada, esto era un no-op silencioso — se pulsaba "Imprimir" y no
 * pasaba absolutamente nada, sin ninguna explicación.
 */
export async function printReceiptViaAgent(orderId: string): Promise<{ error?: string; ok?: boolean }> {
  const auth = await authorizeOrderAccess(orderId);
  if ('error' in auth) return { error: auth.error };

  try {
    const res = await enqueueReceiptForOrder(auth.restaurantId, orderId);
    if (!res.queued) return { error: printFailureMessage(res.reason, 'caja', res.message) };
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { ok: true };
}

/**
 * Reimprime la comanda de cocina de un pedido, a petición expresa (se atascó la
 * impresora, se perdió el papel). Salta el candado anti-duplicado y el ticket
 * sale marcado como "COPIA - NO COCINAR" para que la cocina no prepare el
 * pedido dos veces.
 *
 * Con `stationId` reimprime SOLO esa estación (migración 130). Es lo que hace
 * que «la barra no imprimió · Reintentar» no vuelva a sacar por la cocina un
 * plato que ya está en la plancha.
 */
export async function reprintKitchenTicket(
  orderId: string,
  stationId?: string,
): Promise<{ error?: string; ok?: boolean }> {
  const auth = await authorizeOrderAccess(orderId);
  if ('error' in auth) return { error: auth.error };

  try {
    const res = await enqueueKitchenForOrder(auth.restaurantId, orderId, { force: true, stationId });
    if (!res.queued) return { error: printFailureMessage(res.reason, 'cocina', res.message) };
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { ok: true };
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
  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );
  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    efectivo.isMember ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (await canActOnGroupBranch(restaurantId));
  if (!allowed) return { error: 'No autorizado.' };
  if (!can(efectivo.role, efectivo.permissions, 'pedidos')) {
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

/* ── Alerta de pedidos sin atender (respaldo del Realtime) ───────────── */

/** Lo mínimo que necesita la tarjeta de aviso — nada de items ni totales. */
export interface PendingNewOrder {
  id: string;
  order_number: string;
  customer_name: string;
  order_type: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  /** "Mesa 4" en DINE_IN, dirección en DELIVERY, null en PICKUP (no hay
   *  columna de mesa: se guarda en `address`, ver createOrder). */
  address: string | null;
  created_at: string;
}

/**
 * Pedidos recién llegados que nadie ha confirmado todavía (status NEW).
 *
 * Es la vía de respaldo de la alerta del panel: el aviso de pedido nuevo
 * dependía SOLO de un INSERT de Realtime, así que un socket caído lo dejaba
 * en silencio absoluto y sin rastro visual. Con esto la alerta llega igual por
 * sondeo, como ya hacían las llamadas al mesero (getPendingWaiterCalls).
 *
 * Ventana de 30 minutos: al abrir el panel interesa saber qué entró y sigue sin
 * atender, no arrastrar un pedido NEW olvidado de ayer.
 */
export async function getPendingNewOrders(restaurantId: string): Promise<PendingNewOrder[]> {
  if (!restaurantId) return [];

  const { data: { user } } = await getStaffUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return [];

  // Cualquier miembro del restaurante puede ver el aviso (dueño, caja, mesero):
  // el objetivo es justamente que no dependa de que una persona concreta esté
  // mirando la pantalla de pedidos.
  const ownsBranch = profile.role === 'SUPER_ADMIN'
    || (await canActOnGroupBranch(restaurantId))
    || (await canActOnRestaurant(profile.restaurant_id, restaurantId));
  if (!ownsBranch) return [];

  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await db
    .from('orders')
    .select('id, order_number, customer_name, order_type, address, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'NEW')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(30);

  if (error) return [];
  return (data ?? []) as PendingNewOrder[];
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

  const yaConfirmado = 'Solo puedes cancelar un pedido que aún no ha sido confirmado por el restaurante.';
  if (order.status !== 'NEW') return { error: yaConfirmado };

  /* Comprobar NEW, reponer stock y cancelar, de una vez y con la fila
     bloqueada (migración 143, PROD-09). Hacerlo en tres pasos desde aquí
     dejaba un hueco: si cocina aceptaba entre la lectura y el update, el
     pedido quedaba cancelado con la comanda ya impresa. Y no basta con
     exigir NEW en el update: `restock_order` no repone nada de un pedido
     ya cancelado, así que el stock tiene que volver antes, en la misma
     transacción. */
  const { data: cancelado, error: errRpc } = await db.rpc('cancel_public_order', {
    p_order_id: order.id,
    p_restaurant_id: restaurantId,
  });
  if (!faltaLaFuncion(errRpc)) {
    if (errRpc) return { error: errRpc.message };
    return cancelado ? { success: true } : { error: yaConfirmado };
  }

  // Sin la 143 todavía en esta base: el camino de antes.
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
