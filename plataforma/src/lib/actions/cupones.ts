'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveCoupon, type DiscountType } from '@/lib/db/cupones';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { logActivity } from '@/lib/activity';

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
  // Administrar el grupo de esta sucursal vale igual que ser su dueño
  // (migración 116: el grupo se lee de la organización, no de un rol).
  const enSuGrupo = await canActOnGroupBranch(restaurantId);
  if (!isSuper && !isOwner && !enSuGrupo) return { ok: false as const, error: 'Solo el propietario puede gestionar cupones.' };
  if (!isSuper && !enSuGrupo && !(await canActOnRestaurant(profile.restaurant_id, restaurantId))) {
    return { ok: false as const, error: 'No autorizado.' };
  }

  return { ok: true as const, userId: user.id };
}

/* Bitácora antifraude (PROD-10): un cupón del 100 % para un amigo es
   exactamente lo que el dueño quiere poder ver después, con el importe. */
function anotarCupon(
  restaurantId: string,
  userId: string,
  code: string,
  evento: 'creado' | 'editado' | 'borrado' | 'activado' | 'desactivado',
  extra: Record<string, unknown> = {},
) {
  return logActivity({ restaurantId, actorId: userId, action: 'cupon', entity: code, meta: { evento, ...extra } });
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

  await anotarCupon(restaurantId, auth.userId, code, 'creado', {
    tipo: data.discount_type, valor: data.discount_value, maxUsos: data.max_uses || null,
  });

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
  const { data: previo } = await db
    .from('coupons')
    .select('discount_type, discount_value')
    .eq('id', couponId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
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

  if (previo) {
    await anotarCupon(restaurantId, auth.userId, code, 'editado', {
      tipo: data.discount_type,
      valor: data.discount_value,
      antes: { tipo: previo.discount_type, valor: Number(previo.discount_value) },
    });
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
  const { data: cambiados, error } = await db
    .from('coupons')
    .update({ is_active: isActive })
    .eq('id', couponId)
    .eq('restaurant_id', restaurantId)
    .select('code');
  if (error) return { error: error.message };
  if (cambiados?.[0]) {
    await anotarCupon(restaurantId, auth.userId, cambiados[0].code as string, isActive ? 'activado' : 'desactivado');
  }

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
  const { data: borrados, error } = await db
    .from('coupons')
    .delete()
    .eq('id', couponId)
    .eq('restaurant_id', restaurantId)
    .select('code, discount_type, discount_value, uses');
  if (error) return { error: error.message };
  const borrado = borrados?.[0];
  if (borrado) {
    await anotarCupon(restaurantId, auth.userId, borrado.code as string, 'borrado', {
      tipo: borrado.discount_type, valor: Number(borrado.discount_value), usos: borrado.uses,
    });
  }

  revalidatePath('/admin/cupones');
  return { ok: true };
}
