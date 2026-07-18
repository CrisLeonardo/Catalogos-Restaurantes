'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
// Cliente del COMENSAL: todas las resoluciones de sesión de este módulo son
// del comensal (Google). La cookie es independiente de la del personal.
import { createDinerClient } from '@/lib/supabase/server';
import { authorizeModuleAction } from '@/lib/module-auth';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import {
  getDinerLoyalty, resolveDinerAuthUserId,
  type DinerLoyalty,
} from '@/lib/db/loyalty';

export type LoyaltyActionResult = { error?: string; ok?: boolean; balance?: number };

export interface LoyaltySettingsPatch {
  earn_rate: number;
  earn_amount: number;
  min_redeem: number;
  signup_bonus: number;
  rewards_enabled: boolean;
}

export async function saveLoyaltySettings(restaurantId: string, patch: LoyaltySettingsPatch): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;

  const earn = Number(patch.earn_rate);
  if (isNaN(earn) || earn < 0) return { error: 'Tasa de acumulación inválida.' };
  const amount = Number(patch.earn_amount);
  if (isNaN(amount) || amount <= 0) return { error: 'El monto de gasto debe ser mayor a 0.' };

  const db = createServiceClient();
  const { error } = await db.from('loyalty_settings').upsert({
    restaurant_id: restaurantId,
    earn_rate: earn,
    earn_amount: amount,
    min_redeem: Math.max(0, Math.floor(Number(patch.min_redeem) || 0)),
    signup_bonus: Math.max(0, Math.floor(Number(patch.signup_bonus) || 0)),
    rewards_enabled: patch.rewards_enabled !== false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });
  if (error) return { error: error.message };

  revalidatePath('/admin/lealtad');
  return { ok: true };
}

/* ── Recompensas (catálogo de canje por productos) ────────── */

export interface RewardPatch {
  id?: string;
  product_id: string | null;
  title: string;
  description?: string | null;
  image_url?: string | null;
  points_cost: number;
  active?: boolean;
  stock?: number | null;
  per_customer_limit?: number | null;
  sort_order?: number;
}

export async function saveReward(restaurantId: string, patch: RewardPatch): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;

  const cost = Math.floor(Number(patch.points_cost));
  if (isNaN(cost) || cost <= 0) return { error: 'El costo en puntos debe ser mayor a 0.' };
  const title = (patch.title || '').trim();
  if (!title) return { error: 'Ponle un nombre a la recompensa.' };

  const row = {
    restaurant_id: restaurantId,
    product_id: patch.product_id || null,
    title: title.slice(0, 120),
    description: (patch.description || '').trim().slice(0, 400) || null,
    image_url: (patch.image_url || '').trim() || null,
    points_cost: cost,
    active: patch.active !== false,
    stock: patch.stock == null || patch.stock === undefined || Number.isNaN(Number(patch.stock)) ? null : Math.max(0, Math.floor(Number(patch.stock))),
    per_customer_limit: patch.per_customer_limit == null || Number.isNaN(Number(patch.per_customer_limit)) ? null : Math.max(1, Math.floor(Number(patch.per_customer_limit))),
    sort_order: Math.floor(Number(patch.sort_order) || 0),
  };

  const db = createServiceClient();
  const { error } = patch.id
    ? await db.from('loyalty_rewards').update(row).eq('id', patch.id).eq('restaurant_id', restaurantId)
    : await db.from('loyalty_rewards').insert(row);
  if (error) return { error: error.message };

  revalidatePath('/admin/lealtad');
  return { ok: true };
}

export async function deleteReward(restaurantId: string, rewardId: string): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;
  const db = createServiceClient();
  const { error } = await db.from('loyalty_rewards').delete().eq('id', rewardId).eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };
  revalidatePath('/admin/lealtad');
  return { ok: true };
}

export async function toggleReward(restaurantId: string, rewardId: string, active: boolean): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;
  const db = createServiceClient();
  const { error } = await db.from('loyalty_rewards').update({ active }).eq('id', rewardId).eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };
  revalidatePath('/admin/lealtad');
  return { ok: true };
}

/* ── Comensal: ver y enlazar su saldo de puntos ───────────── */
/* Ver saldo/identidad es getMyAccount() (abajo) — fuente única para "Mi
   cuenta" y "Fidelidad", evita que ambos paneles resuelvan la sesión por
   caminos distintos. */

export interface MyCheckoutProfile {
  name: string;
  phone: string;
  address: string | null;
  zone: string | null;
  /** Último pin de entrega guardado (mig. 065) — null si nunca se colocó uno. */
  lat: number | null;
  lng: number | null;
}

async function fetchCheckoutProfile(restaurantId: string, authUserId: string | null): Promise<MyCheckoutProfile | null> {
  if (!authUserId) return null;
  const db = createServiceClient();
  const { data } = await db
    .from('customers')
    .select('name, phone, default_address, default_zone, default_lat, default_lng')
    .eq('restaurant_id', restaurantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (!data) return null;

  return {
    name: data.name as string,
    phone: data.phone as string,
    address: (data.default_address as string | null) ?? null,
    zone: (data.default_zone as string | null) ?? null,
    lat: (data.default_lat as number | null) ?? null,
    lng: (data.default_lng as number | null) ?? null,
  };
}

/**
 * Perfil guardado en la cuenta (Google) del comensal — nombre/teléfono/
 * dirección del último pedido enlazado a esta cuenta. Permite autocompletar
 * el checkout en CUALQUIER dispositivo, no solo el que guardó el localStorage.
 * Null si no hay sesión o la cuenta todavía no tiene un pedido enlazado (el
 * checkout sigue funcionando con el perfil local en ese caso).
 */
export async function getMyCheckoutProfile(restaurantId: string): Promise<MyCheckoutProfile | null> {
  const supabase = await createDinerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const authUserId = await resolveDinerAuthUserId(user?.id ?? null);
  return fetchCheckoutProfile(restaurantId, authUserId);
}

export interface MyAccount {
  /** ¿Hay una sesión de Google iniciada? */
  loggedIn: boolean;
  /** ¿Esa cuenta ya está enlazada a un cliente con historial en ESTE restaurante? */
  identified: boolean;
  email: string | null;
  /** Nombre de la cuenta de Google (perfil de Google, no el del pedido). */
  name: string | null;
  avatarUrl: string | null;
  checkout: MyCheckoutProfile | null;
  /** null = módulo de lealtad inactivo para este restaurante. */
  loyalty: DinerLoyalty | null;
}

/**
 * Fuente ÚNICA de verdad para "¿quién es este comensal?" — la usan tanto
 * "Mi cuenta" como "Fidelidad". Resuelve la sesión UNA sola vez, siempre
 * server-side (cookies), y trae en la misma llamada el perfil de Google
 * (nombre/avatar), el enlace con el cliente del restaurante y el saldo de
 * puntos. Antes cada panel hacía su propia resolución (una de ellas con un
 * `supabase.auth.getUser()` desde el navegador) y podían desincronizarse:
 * si esa llamada cliente fallaba (red, bloqueadores) la UI mostraba "inicia
 * sesión" a alguien con sesión válida y ocultaba sus datos/puntos ya
 * guardados. Nunca lanza: en el peor caso devuelve el estado "invitado".
 */
export async function getMyAccount(restaurantId: string): Promise<MyAccount> {
  const GUEST: MyAccount = { loggedIn: false, identified: false, email: null, name: null, avatarUrl: null, checkout: null, loyalty: null };
  try {
    const supabase = await createDinerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const authUserId = await resolveDinerAuthUserId(user?.id ?? null);
    const loggedIn = !!authUserId;

    const [checkout, loyalty] = await Promise.all([
      fetchCheckoutProfile(restaurantId, authUserId),
      getDinerLoyalty(restaurantId, authUserId),
    ]);

    return {
      loggedIn,
      identified: !!checkout,
      email: user?.email ?? null,
      name: (user?.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (user?.user_metadata?.avatar_url as string | undefined) ?? null,
      checkout,
      loyalty: loyalty.active ? loyalty : null,
    };
  } catch {
    return GUEST;
  }
}

/**
 * Un usuario con sesión iniciada reclama el historial de puntos de su número
 * (pedidos hechos antes sin cuenta). Enlace 1:1: no roba un número ya enlazado
 * a otra cuenta.
 */
export async function linkMyAccountByPhone(restaurantId: string, phone: string): Promise<LoyaltyActionResult> {
  const supabase = await createDinerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const authUserId = await resolveDinerAuthUserId(user?.id ?? null);
  if (!authUserId) return { error: 'Inicia sesión para enlazar tu número.' };

  const phoneKey = (phone || '').replace(/\D/g, '');
  if (phoneKey.length < 7) return { error: 'Número inválido.' };

  const db = createServiceClient();
  const { data: c } = await db
    .from('customers')
    .select('id, auth_user_id')
    .eq('restaurant_id', restaurantId)
    .eq('phone', phoneKey)
    .maybeSingle();
  if (!c) return { error: 'No encontramos pedidos con ese número todavía.' };
  if (c.auth_user_id && c.auth_user_id !== authUserId) return { error: 'Ese número ya está enlazado a otra cuenta.' };

  // 1:1 — suelta el enlace previo de esta cuenta y asigna al número pedido.
  await db.from('customers').update({ auth_user_id: null }).eq('restaurant_id', restaurantId).eq('auth_user_id', authUserId);
  const { error } = await db.from('customers').update({ auth_user_id: authUserId }).eq('id', c.id as string);
  if (error) return { error: error.message };

  await maybeAwardSignupBonus(restaurantId, c.id as string);
  return { ok: true };
}

/**
 * Puntos de bienvenida (`loyalty_settings.signup_bonus`) al vincular POR
 * PRIMERA VEZ una cuenta de Google a un cliente de este restaurante — ya sea
 * al enlazar manualmente (arriba) o automáticamente al pedir con sesión
 * iniciada (ver `createOrder`). Idempotente: revisa que no exista ya un
 * movimiento 'SIGNUP' para este cliente antes de aplicarlo. Best-effort.
 */
export async function maybeAwardSignupBonus(restaurantId: string, customerId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: rest } = await db.from('restaurants').select('modules, module_settings').eq('id', restaurantId).single();
    if (!rest || !isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'loyalty')) return;

    const { data: settings } = await db.from('loyalty_settings').select('signup_bonus').eq('restaurant_id', restaurantId).maybeSingle();
    const bonus = Math.floor(Number(settings?.signup_bonus) || 0);
    if (bonus <= 0) return;

    const { count } = await db
      .from('loyalty_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('customer_id', customerId)
      .eq('tipo', 'SIGNUP');
    if ((count ?? 0) > 0) return;

    await db.rpc('leogin_loyalty_apply', {
      p_restaurant_id: restaurantId,
      p_customer_id: customerId,
      p_order_id: null,
      p_tipo: 'SIGNUP',
      p_points: bonus,
      p_note: 'Puntos de bienvenida',
    });
  } catch {
    /* best-effort */
  }
}

/** Ajuste manual de puntos: sumar (EARN/ADJUST) o restar (REDEEM). */
export async function adjustPoints(
  restaurantId: string,
  customerId: string,
  points: number,
  tipo: 'ADJUST' | 'REDEEM',
  note: string,
): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;

  const pts = Math.floor(Number(points));
  if (!customerId) return { error: 'Selecciona un cliente.' };
  if (isNaN(pts) || pts <= 0) return { error: 'Indica una cantidad de puntos válida.' };

  const signed = tipo === 'REDEEM' ? -pts : pts;
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_loyalty_apply', {
    p_restaurant_id: restaurantId,
    p_customer_id: customerId,
    p_order_id: null,
    p_tipo: tipo,
    p_points: signed,
    p_note: note?.trim() || (tipo === 'REDEEM' ? 'Canje manual' : 'Ajuste manual'),
  });
  if (error) return { error: error.message };

  revalidatePath('/admin/lealtad');
  return { ok: true, balance: data as number };
}

/**
 * Acumula puntos por un pedido entregado. Best-effort: lo llama el flujo de
 * pedidos al pasar a DELIVERED. No-op si el módulo no está activo, no hay
 * cliente, no hay configuración, O el cliente del pedido no tiene una cuenta
 * de Google enlazada (`customers.auth_user_id`) — los pedidos de invitados
 * (sin sesión iniciada) NUNCA acumulan puntos automáticamente; la identidad
 * de lealtad es exclusivamente la cuenta de Google. Nunca lanza (no debe
 * romper el pedido).
 */
export async function awardLoyaltyForOrder(restaurantId: string, orderId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: rest } = await db
      .from('restaurants')
      .select('modules, module_settings')
      .eq('id', restaurantId)
      .single();
    if (!rest || !isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'loyalty')) return;

    const { data: settings } = await db.from('loyalty_settings').select('earn_rate, earn_amount').eq('restaurant_id', restaurantId).maybeSingle();
    if (!settings) return;

    const { data: order } = await db
      .from('orders')
      .select('id, customer_id')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();
    if (!order || !order.customer_id) return;

    // Invitado (sin cuenta de Google enlazada al momento de entregar) → sin puntos.
    const { data: customer } = await db.from('customers').select('auth_user_id').eq('id', order.customer_id).maybeSingle();
    if (!customer?.auth_user_id) return;

    // Evitar doble acumulación por el mismo pedido.
    const { count } = await db
      .from('loyalty_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('tipo', 'EARN');
    if ((count ?? 0) > 0) return;

    // Puntos por línea: si el producto define sus propios puntos, esos × cantidad;
    // si no, la regla general earn_rate (pts por cada earn_amount gastados) × subtotal
    // de la línea / earn_amount. Los canjes (Q0) no otorgan puntos.
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
    const perProduct = new Map<string, number | null>(
      (prods ?? []).map((p) => [p.id as string, p.loyalty_points as number | null]),
    );

    const earnRate = Number(settings.earn_rate) || 0;
    const earnAmount = Number(settings.earn_amount) || 10;
    let points = 0;
    for (const it of items ?? []) {
      if (it.is_reward) continue;
      const per = it.product_id ? perProduct.get(it.product_id as string) : undefined;
      if (per !== null && per !== undefined) {
        points += Math.max(0, Math.floor(Number(per))) * Number(it.quantity);
      } else {
        points += Math.floor(Number(it.subtotal) * earnRate / earnAmount);
      }
    }
    points = Math.floor(points);
    if (points <= 0) return;

    await db.rpc('leogin_loyalty_apply', {
      p_restaurant_id: restaurantId,
      p_customer_id: order.customer_id,
      p_order_id: orderId,
      p_tipo: 'EARN',
      p_points: points,
      p_note: 'Puntos por pedido',
    });
  } catch {
    /* best-effort: la lealtad no debe romper el flujo de pedidos */
  }
}
