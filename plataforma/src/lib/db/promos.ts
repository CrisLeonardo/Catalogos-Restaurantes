import { createServiceClient } from '@/lib/supabase/service';
import type { Promotion } from '@/types';

/* ============================================================
   PROMOCIONES — lógica pura (Fase D)
   Reutilizada por el checkout (preview) y por createOrder
   (aplicación autoritativa). NO es 'use server'.
   ============================================================ */

/** Descuento en dinero que aplica una promo sobre (subtotal, envío). */
export function computeDiscount(promo: Promotion, subtotal: number, fee: number): number {
  let d = 0;
  if (promo.kind === 'PERCENT') d = subtotal * (Number(promo.value) / 100);
  else if (promo.kind === 'AMOUNT') d = Math.min(Number(promo.value), subtotal);
  else if (promo.kind === 'FREE_DELIVERY') d = fee;
  // Nunca descuenta más que subtotal + envío.
  return Math.max(0, Math.min(d, subtotal + fee));
}

function isLive(p: Promotion, subtotal: number): boolean {
  if (!p.active) return false;
  const now = Date.now();
  if (p.starts_at && now < new Date(p.starts_at).getTime()) return false;
  if (p.ends_at && now > new Date(p.ends_at).getTime()) return false;
  if (p.usage_limit != null && p.used_count >= p.usage_limit) return false;
  if (subtotal < Number(p.min_order)) return false;
  return true;
}

/**
 * Resuelve la promo aplicable a un pedido:
 *  · Si el cliente escribió un código → busca ese cupón.
 *  · Si no → la mejor promo automática (code NULL) que califique.
 * Devuelve la promo + el descuento, o null si nada aplica.
 */
export async function resolvePromo(
  restaurantId: string,
  code: string | null | undefined,
  subtotal: number,
  fee: number,
): Promise<{ promo: Promotion; discount: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return null;
  const db = createServiceClient();

  if (code && code.trim()) {
    const { data } = await db
      .from('promotions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .ilike('code', code.trim())
      .maybeSingle();
    const p = data as Promotion | null;
    if (!p || !isLive(p, subtotal)) return null;
    return { promo: p, discount: computeDiscount(p, subtotal, fee) };
  }

  // Automáticas: la de mayor descuento que califique.
  const { data } = await db
    .from('promotions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .is('code', null)
    .eq('active', true);

  let best: { promo: Promotion; discount: number } | null = null;
  for (const row of (data ?? []) as Promotion[]) {
    if (!isLive(row, subtotal)) continue;
    const discount = computeDiscount(row, subtotal, fee);
    if (discount > 0 && (!best || discount > best.discount)) best = { promo: row, discount };
  }
  return best;
}

/** Lista de promociones del restaurante (panel admin, service role). */
export async function listPromotions(restaurantId: string): Promise<Promotion[]> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data } = await db
    .from('promotions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Promotion[];
}
