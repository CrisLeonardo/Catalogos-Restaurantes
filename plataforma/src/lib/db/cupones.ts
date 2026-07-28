import { createServiceClient } from '@/lib/supabase/service';

export type DiscountType = 'PERCENT' | 'FIXED';

export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order: number | null;
  max_uses: number | null;
  uses: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getCoupons(restaurantId: string): Promise<Coupon[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Coupon[];
}

export async function getCouponByCode(restaurantId: string, code: string): Promise<Coupon | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .maybeSingle();
  return data as Coupon | null;
}

/** Descuento en dinero que aplica un cupón sobre el subtotal. */
export function computeCouponDiscount(coupon: Coupon, subtotal: number): number {
  const d = coupon.discount_type === 'PERCENT'
    ? subtotal * (Number(coupon.discount_value) / 100)
    : Number(coupon.discount_value);
  return Math.max(0, Math.min(d, subtotal));
}

function isCouponLive(c: Coupon, subtotal: number): boolean {
  if (!c.is_active) return false;
  const now = Date.now();
  if (c.valid_from && now < new Date(c.valid_from).getTime()) return false;
  if (c.valid_until && now > new Date(c.valid_until).getTime()) return false;
  if (c.max_uses != null && c.uses >= c.max_uses) return false;
  if (c.min_order != null && subtotal < Number(c.min_order)) return false;
  return true;
}

/**
 * Resuelve el cupón aplicable a un pedido a partir del código escrito por
 * el cliente en el checkout. Devuelve el cupón + el descuento, o null si
 * el código no existe, está pausado/vencido/agotado, o no aplica al monto.
 */
export async function resolveCoupon(
  restaurantId: string,
  code: string | null | undefined,
  subtotal: number,
): Promise<{ coupon: Coupon; discount: number } | null> {
  if (!code?.trim()) return null;
  const coupon = await getCouponByCode(restaurantId, code);
  if (!coupon || !isCouponLive(coupon, subtotal)) return null;
  const discount = computeCouponDiscount(coupon, subtotal);
  if (discount <= 0) return null;
  return { coupon, discount };
}

/** Devuelve true si el restaurante tiene al menos un cupón activo y vigente (para mostrar el campo en el checkout). */
export async function hasActiveCoupons(restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from('coupons')
    .select('id, valid_from, valid_until, max_uses, uses')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .limit(20);

  const now = Date.now();
  return (data ?? []).some((c) => {
    if (c.valid_from && now < new Date(c.valid_from).getTime()) return false;
    if (c.valid_until && now > new Date(c.valid_until).getTime()) return false;
    if (c.max_uses != null && c.uses >= c.max_uses) return false;
    return true;
  });
}
