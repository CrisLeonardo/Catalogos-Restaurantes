import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type Lectura } from '@/lib/db/lectura';
import { estadoDelCupon, type CuponVigencia } from '@/lib/cupones/vigencia';

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

/** Un error ya no se pinta «Aún no tienes cupones» (auditoría 2026-11-03, X20). */
export async function getCoupons(restaurantId: string): Promise<Lectura<Coupon[]>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  return lecturaDe(error, data as Coupon[] | null, [], { contexto: 'getCoupons' });
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

/** Mismo estado que ve el dueño en su panel (lib/cupones/vigencia) + el mínimo de compra. */
export function isCouponLive(c: Coupon, subtotal: number): boolean {
  if (estadoDelCupon(c) !== 'vigente') return false;
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

/**
 * ¿Tiene el restaurante al menos un cupón vigente? (para mostrar el campo
 * en el checkout).
 *
 * Antes traía 20 cupones activos y filtraba fechas después: con veinte
 * vencidos por delante, uno válido no habilitaba el campo (auditoría
 * 2026-11-03, X06). Ahora las fechas se filtran en la base y no hay tope;
 * los usos se miran aquí porque PostgREST no compara dos columnas.
 */
export async function hasActiveCoupons(restaurantId: string): Promise<boolean> {
  const db = createServiceClient();
  const ahora = new Date().toISOString();
  const { data } = await db
    .from('coupons')
    .select('is_active, valid_from, valid_until, max_uses, uses')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .or(`valid_from.is.null,valid_from.lte.${ahora}`)
    .or(`valid_until.is.null,valid_until.gt.${ahora}`);

  return (data ?? []).some((c) => estadoDelCupon(c as CuponVigencia) === 'vigente');
}
