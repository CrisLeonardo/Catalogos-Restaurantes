import { createServiceClient } from '@/lib/supabase/service';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';

export interface RedeemContext {
  active: boolean;       // módulo activo + cuenta con saldo canjeable
  balance: number;       // saldo de puntos del cliente
  minRedeem: number;     // mínimo de puntos para canjear
  redeemValue: number;   // valor en moneda de cada punto
}

const NO_REDEEM: RedeemContext = { active: false, balance: 0, minRedeem: 0, redeemValue: 0 };

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
    balance: Number(acct.points_balance) || 0,
    minRedeem: Number(settings.min_redeem) || 0,
    redeemValue: Number(settings.redeem_value) || 0,
  };
}

/** Contexto de canje a partir del teléfono (lo usa el checkout para mostrar la opción). */
export async function getRedeemContextByPhone(restaurantId: string, phone: string): Promise<RedeemContext> {
  const phoneKey = (phone || '').replace(/\D/g, '');
  if (phoneKey.length < 7) return NO_REDEEM;
  if (!(await loyaltyActive(restaurantId))) return NO_REDEEM;

  const db = createServiceClient();
  const { data: customer } = await db
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('phone', phoneKey)
    .maybeSingle();
  if (!customer) return NO_REDEEM;

  return getRedeemContextByCustomer(restaurantId, customer.id as string);
}

export interface LoyaltySettings {
  restaurant_id: string;
  earn_rate: number;
  redeem_value: number;
  min_redeem: number;
  signup_bonus: number;
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
  if (data) return data as LoyaltySettings;
  return {
    restaurant_id: restaurantId,
    earn_rate: 1,
    redeem_value: 0.1,
    min_redeem: 100,
    signup_bonus: 0,
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
