import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import type { LoyaltyReward } from '@/types';

/** ¿Está activo el módulo de lealtad para este restaurante? (entitlement + on) */
export async function loyaltyActive(restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data: rest } = await db.from('restaurants').select('modules, module_settings').eq('id', restaurantId).single();
  if (!rest) return false;
  return isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'loyalty');
}

export interface LoyaltySettings {
  restaurant_id: string;
  earn_rate: number;
  /** Monto (Q) sobre el que se aplica earn_rate. Ej. 1 pt por cada earn_amount=10. */
  earn_amount: number;
  redeem_value: number;
  min_redeem: number;
  signup_bonus: number;
  /** Mostrar el catálogo de recompensas (canje por productos) en el menú. */
  rewards_enabled: boolean;
  updated_at: string;
}

export interface LoyaltyAccount {
  id: string;
  restaurant_id: string;
  customer_id: string;
  points_balance: number;
  lifetime_points: number;
  updated_at: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  order_id: string | null;
  tipo: string;
  points: number;
  note: string;
  created_at: string;
}

export async function getLoyaltySettings(restaurantId: string): Promise<LoyaltySettings> {
  const db = createServiceClient();
  const { data } = await db.from('loyalty_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle();
  if (data) return { rewards_enabled: true, ...data } as LoyaltySettings;
  return {
    restaurant_id: restaurantId,
    earn_rate: 1,
    earn_amount: 10,
    redeem_value: 0.1,
    min_redeem: 100,
    signup_bonus: 0,
    rewards_enabled: true,
    updated_at: new Date().toISOString(),
  };
}

export async function loyaltySettingsExist(restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { count } = await db.from('loyalty_settings').select('restaurant_id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);
  return (count ?? 0) > 0;
}

export async function getLoyaltyAccounts(restaurantId: string, limit = 100): Promise<LoyaltyAccount[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('loyalty_accounts')
    .select('*, customer:customers(name, phone)')
    .eq('restaurant_id', restaurantId)
    .order('points_balance', { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const { customer, ...acc } = row as Record<string, unknown> & { customer?: { name: string; phone: string } | null };
    return { ...acc, customer_name: customer?.name ?? 'Cliente', customer_phone: customer?.phone ?? '' } as LoyaltyAccount;
  });
}

export interface LoyaltySummary {
  members: number;
  puntosVigentes: number;
  canjeadosMes: number;
}

export async function getLoyaltySummary(restaurantId: string): Promise<LoyaltySummary> {
  const db = createServiceClient();
  const [{ data: accounts }, { data: txns }] = await Promise.all([
    db.from('loyalty_accounts').select('points_balance').eq('restaurant_id', restaurantId),
    db.from('loyalty_transactions').select('points, tipo, created_at').eq('restaurant_id', restaurantId).eq('tipo', 'REDEEM'),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const canjeadosMes = (txns ?? [])
    .filter((t) => new Date(t.created_at as string) >= monthStart)
    .reduce((a, t) => a + Math.abs(Number(t.points)), 0);

  return {
    members: (accounts ?? []).length,
    puntosVigentes: (accounts ?? []).reduce((a, r) => a + Number(r.points_balance), 0),
    canjeadosMes,
  };
}

/** Clientes del restaurante (para asignar puntos manualmente). */
export async function getCustomersForLoyalty(restaurantId: string, limit = 200): Promise<{ id: string; name: string; phone: string }[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('customers')
    .select('id, name, phone')
    .eq('restaurant_id', restaurantId)
    .order('name')
    .limit(limit);
  return (data ?? []) as { id: string; name: string; phone: string }[];
}

/* ════════════════════════════════════════════════════════════
   Recompensas (catálogo de canje por productos) — migración 058
   ════════════════════════════════════════════════════════════ */

export interface RewardRow extends LoyaltyReward {
  /** Nombre del producto enlazado (si aplica) — para el panel admin. */
  product_name?: string | null;
  product_available?: boolean | null;
}

/** Catálogo completo (admin): todas las recompensas, activas o no. */
export async function getRewards(restaurantId: string): Promise<RewardRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('loyalty_rewards')
    .select('*, product:products(name, is_available, is_active)')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
    .order('created_at');

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const { product, ...r } = row as Record<string, unknown> & {
      product?: { name: string; is_available: boolean; is_active: boolean } | null;
    };
    return {
      ...(r as unknown as LoyaltyReward),
      product_name: product?.name ?? null,
      product_available: product ? product.is_available && product.is_active : null,
    } as RewardRow;
  });
}

/** Productos del menú para elegir como recompensa (admin). */
export async function getProductsForRewards(restaurantId: string, limit = 500): Promise<{ id: string; name: string; price: number; image_url: string | null; cost: number | null }[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('products')
    .select('id, name, price, image_url, cost')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('name')
    .limit(limit);
  return (data ?? []) as { id: string; name: string; price: number; image_url: string | null; cost: number | null }[];
}

export interface PublicReward {
  id: string;
  product_id: string | null;
  /** Nombre visible (título de la recompensa o, si no, el del producto). */
  title: string;
  description: string | null;
  image_url: string | null;
  /** Ícono del producto enlazado (para el patrón de marca cuando no hay foto). */
  icon: string | null;
  tags: string[] | null;
  points_cost: number;
  /** Unidades restantes (NULL = ilimitado); 0 = agotado. */
  stock: number | null;
}

/**
 * Catálogo público (menú): solo recompensas activas y con stock. Trae además
 * los datos del producto enlazado (imagen/ícono/tags/descripción) para que las
 * tarjetas se vean IDÉNTICAS a las del menú, solo que con precio en puntos.
 */
export async function getPublicRewards(restaurantId: string): Promise<PublicReward[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('loyalty_rewards')
    .select('id, product_id, title, description, image_url, points_cost, sort_order, stock, product:products(name, description, image_url, icon, tags)')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .order('points_cost')
    .order('sort_order');

  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => {
      const { product, ...r } = row as Record<string, unknown> & {
        product?: { name: string; description: string | null; image_url: string | null; icon: string | null; tags: string[] | null } | null;
      };
      const base = r as unknown as { id: string; product_id: string | null; title: string; description: string | null; image_url: string | null; points_cost: number; stock: number | null };
      return {
        id: base.id,
        product_id: base.product_id,
        title: base.title?.trim() || product?.name || 'Recompensa',
        description: base.description ?? product?.description ?? null,
        image_url: base.image_url ?? product?.image_url ?? null,
        icon: product?.icon ?? null,
        tags: product?.tags ?? null,
        points_cost: Number(base.points_cost) || 0,
        stock: base.stock,
      } as PublicReward;
    })
    .filter((r) => r.stock === null || r.stock > 0);
}

/** Etiqueta de caché de lo que el MENÚ muestra de la lealtad (ajustes y
    catálogo de canje). Se expira con updateTag() en las acciones que los
    editan (actions/loyalty.ts). */
export const loyaltyTag = (restaurantId: string) => `loyalty:${restaurantId}`;

/**
 * Ajustes + catálogo de canje para el menú público, cacheados entre
 * peticiones (60 s, como la carta). Antes eran dos consultas EN VIVO en cada
 * visita al menú de un restaurante con lealtad, a Virginia y de vuelta.
 *
 * También cuelga de `menu:<id>`: las tarjetas de canje copian nombre, foto y
 * etiquetas del platillo enlazado, así que editar la carta las refresca.
 * El `stock` puede ir hasta un minuto por detrás tras un canje; no importa
 * para cobrar de más o de menos: el canje lo valida la base
 * (leogin_loyalty_redeem_reward), no esta lista.
 */
export function getPublicLoyaltyCached(restaurantId: string) {
  return unstable_cache(
    async () => {
      const [settings, rewards] = await Promise.all([
        getLoyaltySettings(restaurantId),
        getPublicRewards(restaurantId),
      ]);
      return { settings, rewards };
    },
    ['public-loyalty', restaurantId],
    { revalidate: 60, tags: [loyaltyTag(restaurantId), `menu:${restaurantId}`] },
  )();
}

export interface DinerLoyalty {
  /** ¿El módulo de lealtad está activo para este restaurante? */
  active: boolean;
  /** ¿Hay una sesión de Google iniciada? */
  loggedIn: boolean;
  /** ¿La cuenta de Google ya está enlazada a un cliente con historial? */
  identified: boolean;
  name: string | null;
  balance: number;
  lifetimePoints: number;
  redeemValue: number;
  minRedeem: number;
}

const NO_DINER: DinerLoyalty = {
  active: false, loggedIn: false, identified: false,
  name: null, balance: 0, lifetimePoints: 0, redeemValue: 0, minRedeem: 0,
};

/**
 * Resuelve el auth_user_id de un COMENSAL a partir de la sesión de Supabase.
 *
 * Antes descartaba cuentas de staff (si el id existía en `profiles`): como
 * Supabase enlaza identidades por email verificado, un dueño/mesero que
 * entraba con Google usando el correo de su cuenta de staff quedaba con
 * loggedIn=false — la UI le pedía "inicia sesión" en un bucle infinito por
 * más que la sesión de Google fuera válida, y el filtro era GLOBAL: cualquier
 * comensal que fuera staff de CUALQUIER restaurante de la plataforma quedaba
 * vetado de la lealtad en todos. Ese filtro se eliminó: la cuenta de Google
 * de un miembro del personal es un comensal válido (sus consultas de lealtad
 * van siempre por (restaurant_id, auth_user_id), sin privilegios de staff —
 * el panel admin usa su PROPIA cookie de sesión, aquí no interviene).
 */
export async function resolveDinerAuthUserId(rawUserId: string | null | undefined): Promise<string | null> {
  return rawUserId ?? null;
}

/** Customer_id enlazado a una cuenta de Google, o null si no hay enlace (o no hay sesión). */
export async function getCustomerIdByAuthUser(restaurantId: string, authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null;
  const db = createServiceClient();
  const { data } = await db
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/**
 * Saldo y reglas para un comensal concreto. La lealtad SOLO se resuelve por
 * cuenta de Google enlazada (auth_user_id) — nunca por teléfono, para que
 * nadie pueda ver o gastar los puntos de otro con solo escribir su número.
 * Lo usa la sección de recompensas del menú. `authUserId` lo provee el
 * server action (cookie de sesión).
 */
export async function getDinerLoyalty(restaurantId: string, authUserId: string | null): Promise<DinerLoyalty> {
  if (!(await loyaltyActive(restaurantId))) return NO_DINER;
  const db = createServiceClient();

  const { data: settings } = await db
    .from('loyalty_settings')
    .select('redeem_value, min_redeem')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const redeemValue = Number(settings?.redeem_value) || 0;
  const minRedeem = Number(settings?.min_redeem) || 0;
  const loggedIn = !!authUserId;

  const customerId = await getCustomerIdByAuthUser(restaurantId, authUserId);
  if (!customerId) {
    return { ...NO_DINER, active: true, loggedIn, redeemValue, minRedeem };
  }

  const [{ data: customer }, { data: acct }] = await Promise.all([
    db.from('customers').select('name').eq('id', customerId).maybeSingle(),
    db.from('loyalty_accounts').select('points_balance, lifetime_points').eq('restaurant_id', restaurantId).eq('customer_id', customerId).maybeSingle(),
  ]);

  return {
    active: true,
    loggedIn,
    identified: true,
    name: (customer?.name as string | null) ?? null,
    balance: Number(acct?.points_balance) || 0,
    lifetimePoints: Number(acct?.lifetime_points) || 0,
    redeemValue,
    minRedeem,
  };
}

/* ── Premio del primer pedido y sorpresa de la casa (migración 147) ──────
   PLAN_MOMENTOS_PICO M3 y M4. Se leen aparte de los ajustes de siempre:
   si la 147 todavía no corrió, pedir estas columnas junto con las otras
   tumbaría también la lectura de earn_rate y nadie sumaría puntos. */

export interface AjustesExtraLealtad {
  /** El primer pedido con cuenta, hecho por el comensal, suma el doble. */
  primerPedidoDoble: boolean;
  /** «Hoy el postre va por la casa». null = sorpresa apagada. */
  sorpresaTexto: string | null;
  /** Sale en uno de cada N pedidos. */
  sorpresaCada: number | null;
}

const EXTRA_POR_OMISION: AjustesExtraLealtad = { primerPedidoDoble: true, sorpresaTexto: null, sorpresaCada: null };

export async function leerAjustesExtraLealtad(restaurantId: string): Promise<AjustesExtraLealtad> {
  const { data, error } = await createServiceClient()
    .from('loyalty_settings')
    .select('primer_pedido_doble, sorpresa_texto, sorpresa_cada')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (error || !data) return EXTRA_POR_OMISION;
  const d = data as { primer_pedido_doble?: boolean | null; sorpresa_texto?: string | null; sorpresa_cada?: number | null };
  const texto = d.sorpresa_texto?.trim() || null;
  const cada = Number(d.sorpresa_cada) || null;
  return {
    primerPedidoDoble: d.primer_pedido_doble !== false,
    sorpresaTexto: texto && cada ? texto : null,
    sorpresaCada: texto && cada ? cada : null,
  };
}

export interface PuntosDelPedido {
  /** Lo que suma el pedido, ya con el doble si aplica. */
  puntos: number;
  /** ¿Es el primer pedido del comensal hecho desde su celular y va doble? */
  doble: boolean;
  customerId: string | null;
}

/**
 * Los puntos que da un pedido al entregarse. Una sola regla para acreditar
 * (awardLoyaltyForOrder) y para avisarle al comensal cuánto va a sumar
 * (la pantalla de «pedido enviado»):
 *
 * - Por línea: si el producto define sus propios puntos, esos × cantidad;
 *   si no, earn_rate puntos por cada earn_amount gastados. Los canjes (Q0)
 *   no dan puntos.
 * - Doble (147) si el restaurante lo deja encendido, el pedido lo hizo el
 *   comensal (sin mesero) y es el primero que le acredita puntos aquí.
 *
 * No mira si el módulo está activo ni si el cliente tiene cuenta: eso lo
 * decide quien llama.
 */
export async function puntosDelPedido(restaurantId: string, orderId: string): Promise<PuntosDelPedido> {
  const NADA: PuntosDelPedido = { puntos: 0, doble: false, customerId: null };
  const db = createServiceClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    db.from('loyalty_settings').select('earn_rate, earn_amount').eq('restaurant_id', restaurantId).maybeSingle(),
    db.from('orders').select('id, customer_id, waiter_id').eq('id', orderId).eq('restaurant_id', restaurantId).maybeSingle(),
  ]);
  if (!settings || !order) return NADA;
  const customerId = (order.customer_id as string | null) ?? null;

  const { data: items } = await db
    .from('order_items')
    .select('product_id, quantity, subtotal, is_reward')
    .eq('order_id', orderId);
  const productIds = [...new Set((items ?? [])
    .filter((i) => i.product_id && !i.is_reward)
    .map((i) => i.product_id as string))];
  const { data: prods } = productIds.length
    ? await db.from('products').select('id, loyalty_points').in('id', productIds)
    : { data: [] as { id: string; loyalty_points: number | null }[] };
  const porProducto = new Map<string, number | null>(
    (prods ?? []).map((p) => [p.id as string, p.loyalty_points as number | null]),
  );

  const earnRate = Number(settings.earn_rate) || 0;
  const earnAmount = Number(settings.earn_amount) || 10;
  let puntos = 0;
  for (const it of items ?? []) {
    if (it.is_reward) continue;
    const propios = it.product_id ? porProducto.get(it.product_id as string) : undefined;
    if (propios !== null && propios !== undefined) {
      puntos += Math.max(0, Math.floor(Number(propios))) * Number(it.quantity);
    } else {
      puntos += Math.floor(Number(it.subtotal) * earnRate / earnAmount);
    }
  }
  puntos = Math.floor(puntos);
  if (puntos <= 0) return { ...NADA, customerId };

  let doble = false;
  if (!order.waiter_id) {
    const extra = await leerAjustesExtraLealtad(restaurantId);
    if (extra.primerPedidoDoble) {
      if (!customerId) {
        doble = true;
      } else {
        const { count } = await db
          .from('loyalty_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('customer_id', customerId)
          .eq('tipo', 'EARN')
          .neq('order_id', orderId);
        doble = (count ?? 0) === 0;
      }
    }
  }
  return { puntos: doble ? puntos * 2 : puntos, doble, customerId };
}
