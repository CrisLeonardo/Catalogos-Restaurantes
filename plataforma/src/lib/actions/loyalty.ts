'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { authorizeModuleAction } from '@/lib/module-auth';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import { getRedeemContextByPhone, type RedeemContext } from '@/lib/db/loyalty';

/**
 * Consulta pública (checkout): cuántos puntos puede canjear el cliente con su
 * teléfono. Devuelve saldo + reglas solo si el módulo está activo y tiene cuenta.
 */
export async function getLoyaltyRedeemInfo(restaurantId: string, phone: string): Promise<RedeemContext> {
  if (!restaurantId) return { active: false, balance: 0, minRedeem: 0, redeemValue: 0 };
  return getRedeemContextByPhone(restaurantId, phone);
}

export type LoyaltyActionResult = { error?: string; ok?: boolean; balance?: number };

export interface LoyaltySettingsPatch {
  earn_rate: number;
  redeem_value: number;
  min_redeem: number;
  signup_bonus: number;
}

export async function saveLoyaltySettings(restaurantId: string, patch: LoyaltySettingsPatch): Promise<LoyaltyActionResult> {
  const auth = await authorizeModuleAction(restaurantId, 'loyalty');
  if ('error' in auth) return auth;

  const earn = Number(patch.earn_rate);
  const redeem = Number(patch.redeem_value);
  if (isNaN(earn) || earn < 0) return { error: 'Tasa de acumulación inválida.' };
  if (isNaN(redeem) || redeem < 0) return { error: 'Valor de canje inválido.' };

  const db = createServiceClient();
  const { error } = await db.from('loyalty_settings').upsert({
    restaurant_id: restaurantId,
    earn_rate: earn,
    redeem_value: redeem,
    min_redeem: Math.max(0, Math.floor(Number(patch.min_redeem) || 0)),
    signup_bonus: Math.max(0, Math.floor(Number(patch.signup_bonus) || 0)),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });
  if (error) return { error: error.message };

  revalidatePath('/admin/lealtad');
  return { ok: true };
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
 * cliente o no hay configuración. Nunca lanza (no debe romper el pedido).
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

    const { data: settings } = await db.from('loyalty_settings').select('earn_rate').eq('restaurant_id', restaurantId).maybeSingle();
    if (!settings) return;

    const { data: order } = await db
      .from('orders')
      .select('id, customer_id, total')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();
    if (!order || !order.customer_id) return;

    // Evitar doble acumulación por el mismo pedido.
    const { count } = await db
      .from('loyalty_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('tipo', 'EARN');
    if ((count ?? 0) > 0) return;

    const points = Math.floor(Number(order.total) * Number(settings.earn_rate));
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
