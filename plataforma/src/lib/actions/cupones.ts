'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveCoupon, type DiscountType } from '@/lib/db/cupones';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export type CouponResult = { error?: string; ok?: boolean };

const UUID_RE = /^[0-9a-f-]{36}$/i;

/* ── Preview público (checkout) ─────────────────────────────── */
/**
 * Comprueba un código de cupón desde el checkout (público, sin sesión).
 *
 * Al ser un oráculo de "existe / no existe" abierto a internet, sin freno se
 * podían adivinar los códigos de cualquier restaurante a fuerza bruta (los
 * códigos suelen ser cortos y legibles). El límite por IP+restaurante deja
 * pasar de sobra los intentos honestos de un comensal.
 */
export async function validateCoupon(
  restaurantId: string,
  code: string,
  subtotal: number,
): Promise<{ ok: true; discount: number; code: string } | { ok: false; error: string }> {
  if (!UUID_RE.test(restaurantId)) return { ok: false, error: 'Restaurante inválido.' };
  if (!code?.trim()) return { ok: false, error: 'Escribe un código.' };
  if (code.length > 64) return { ok: false, error: 'Cupón no válido o no aplica a tu pedido.' };

  const ip = clientIp(await headers());
  if (!(await rateLimit(`coupon:${ip}:${restaurantId}`, 15, 10 * 60_000))) {
    return { ok: false, error: 'Demasiados intentos. Espera unos minutos.' };
  }

  const res = await resolveCoupon(restaurantId, code, Number(subtotal) || 0);
  if (!res) return { ok: false, error: 'Cupón no válido o no aplica a tu pedido.' };
  return { ok: true, discount: res.discount, code: res.coupon.code };
}

async function getAuthorized(restaurantId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false as const, error: 'Perfil no encontrado.' };

  const isSuper = profile.role === 'SUPER_ADMIN';
  const isOwner = profile.role === 'RESTAURANT_OWNER';
  const isGroupOwner = profile.role === 'GROUP_OWNER';
  if (!isSuper && !isOwner && !isGroupOwner) return { ok: false as const, error: 'Solo el propietario puede gestionar cupones.' };
  if (isGroupOwner) {
    if ((await resolveGroupBranchId()) !== restaurantId) return { ok: false as const, error: 'No autorizado.' };
  } else if (!isSuper && profile.restaurant_id !== restaurantId) {
    return { ok: false as const, error: 'No autorizado.' };
  }

  return { ok: true as const };
}

export async function createCoupon(
  restaurantId: string,
  data: {
    code: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    min_order?: number;
    max_uses?: number;
    valid_from?: string;
    valid_until?: string;
  },
): Promise<CouponResult> {
  const auth = await getAuthorized(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const code = data.code?.toUpperCase().trim().replace(/\s+/g, '');
  if (!code) return { error: 'El código es requerido.' };
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return { error: 'Código inválido (3-20 caracteres, letras, números, guión o guión bajo).' };
  if (!data.discount_value || data.discount_value <= 0) return { error: 'El valor del descuento debe ser mayor a 0.' };
  if (data.discount_type === 'PERCENT' && data.discount_value > 100) return { error: 'El porcentaje no puede superar 100%.' };

  const db = createServiceClient();
  const { error } = await db.from('coupons').insert({
    restaurant_id: restaurantId,
    code,
    description: data.description?.trim() || null,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    min_order: data.min_order || null,
    max_uses: data.max_uses || null,
    valid_from: data.valid_from || null,
    valid_until: data.valid_until || null,
    is_active: true,
  });
  if (error) {
    if (error.message.includes('unique')) return { error: 'Ya existe un cupón con ese código.' };
    return { error: error.message };
  }

  revalidatePath('/admin/cupones');
  return { ok: true };
}

export async function updateCoupon(
  restaurantId: string,
  couponId: string,
  data: {
    code: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    min_order?: number;
    max_uses?: number;
    valid_from?: string;
    valid_until?: string;
  },
): Promise<CouponResult> {
  const auth = await getAuthorized(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const code = data.code?.toUpperCase().trim().replace(/\s+/g, '');
  if (!code) return { error: 'El código es requerido.' };
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return { error: 'Código inválido (3-20 caracteres, letras, números, guión o guión bajo).' };
  if (!data.discount_value || data.discount_value <= 0) return { error: 'El valor del descuento debe ser mayor a 0.' };
  if (data.discount_type === 'PERCENT' && data.discount_value > 100) return { error: 'El porcentaje no puede superar 100%.' };

  const db = createServiceClient();
  const { error } = await db.from('coupons').update({
    code,
    description: data.description?.trim() || null,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    min_order: data.min_order || null,
    max_uses: data.max_uses || null,
    valid_from: data.valid_from || null,
    valid_until: data.valid_until || null,
  }).eq('id', couponId).eq('restaurant_id', restaurantId);
  if (error) {
    if (error.message.includes('unique')) return { error: 'Ya existe un cupón con ese código.' };
    return { error: error.message };
  }

  revalidatePath('/admin/cupones');
  return { ok: true };
}

export async function toggleCoupon(
  restaurantId: string,
  couponId: string,
  isActive: boolean,
): Promise<CouponResult> {
  const auth = await getAuthorized(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('coupons')
    .update({ is_active: isActive })
    .eq('id', couponId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/cupones');
  return { ok: true };
}

export async function deleteCoupon(
  restaurantId: string,
  couponId: string,
): Promise<CouponResult> {
  const auth = await getAuthorized(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('coupons')
    .delete()
    .eq('id', couponId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/cupones');
  return { ok: true };
}
