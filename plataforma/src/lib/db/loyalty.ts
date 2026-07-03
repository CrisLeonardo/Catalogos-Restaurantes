import { createServiceClient } from '@/lib/supabase/service';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import type { LoyaltyReward } from '@/types';

export interface RedeemContext {
  active: boolean;       // módulo activo + cuenta con saldo canjeable
  /** ¿Hay una sesión de Google iniciada? (independiente de `active`: puede estar
   *  logueado sin cuenta enlazada, o sin saldo suficiente). */
  loggedIn: boolean;
  balance: number;       // saldo de puntos del cliente
  minRedeem: number;     // mínimo de puntos para canjear
  redeemValue: number;   // valor en moneda de cada punto
}

const NO_REDEEM: RedeemContext = { active: false, loggedIn: false, balance: 0, minRedeem: 0, redeemValue: 0 };

/** ¿Está activo el módulo de lealtad para este restaurante? (entitlement + on) */
async function loyaltyActive(restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data: rest } = await db.from('restaurants').select('modules, module_settings').eq('id', restaurantId).single();
  if (!rest) return false;
  return isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'loyalty');
}

/** Contexto de canje a partir del customer_id (lo usa createOrder en el servidor). */
export async function getRedeemContextByCustomer(restaurantId: string, customerId: string): Promise<RedeemContext> {
  if (!customerId) return NO_REDEEM;
  if (!(await loyaltyActive(restaurantId))) return NO_REDEEM;

  const db = createServiceClient();
  const [{ data: settings }, { data: acct }] = await Promise.all([
    db.from('loyalty_settings').select('redeem_value, min_redeem').eq('restaurant_id', restaurantId).maybeSingle(),
    db.from('loyalty_accounts').select('points_balance').eq('restaurant_id', restaurantId).eq('customer_id', customerId).maybeSingle(),
  ]);
  if (!settings || !acct) return NO_REDEEM;

  return {
    active: true,
    loggedIn: true, // solo se llega aquí con un customerId ya resuelto por auth_user_id
    balance: Number(acct.points_balance) || 0,
    minRedeem: Number(settings.min_redeem) || 0,
    redeemValue: Number(settings.redeem_value) || 0,
  };
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
 * Resuelve el auth_user_id de un COMENSAL a partir de la sesión de Supabase,
 * descartando cuentas de staff. La cookie de sesión se comparte entre todos
 * los subdominios (`.leogin.online`): si el dueño o un mesero prueba el menú
 * público en el mismo navegador donde tiene abierto el panel admin, `getUser()`
 * devuelve SU cuenta, no la de un cliente. Sin este filtro, esa cuenta de staff
 * quedaría enlazada (o mostraría puntos) como si fuera un cliente cualquiera.
 */
export async function resolveDinerAuthUserId(rawUserId: string | null | undefined): Promise<string | null> {
  if (!rawUserId) return null;
  const db = createServiceClient();
  const { data } = await db.from('profiles').select('id').eq('id', rawUserId).maybeSingle();
  return data ? null : rawUserId;
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
