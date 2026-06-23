'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { DiscountType } from '@/lib/db/cupones';

export type CouponResult = { error?: string; ok?: boolean };

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
  if (!isSuper && !isOwner) return { ok: false as const, error: 'Solo el propietario puede gestionar cupones.' };
  if (!isSuper && profile.restaurant_id !== restaurantId) return { ok: false as const, error: 'No autorizado.' };

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
