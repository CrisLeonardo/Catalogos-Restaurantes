'use server';

/* ============================================================
   PROMOCIONES — acciones (Fase D)
   · validatePromo: preview público para el checkout.
   · CRUD admin (dueño o staff con permiso 'promociones').
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/permissions';
import { logActivity } from '@/lib/activity';
import { resolvePromo } from '@/lib/db/promos';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/* ── Preview público (checkout) ─────────────────────────────── */
export async function validatePromo(
  restaurantId: string,
  code: string,
  subtotal: number,
  fee: number = 0,
): Promise<{ ok: true; discount: number; name: string; code: string } | { ok: false; error: string }> {
  if (!UUID_RE.test(restaurantId)) return { ok: false, error: 'Restaurante inválido.' };
  if (!code?.trim()) return { ok: false, error: 'Escribe un código.' };

  const res = await resolvePromo(restaurantId, code, Number(subtotal) || 0, Number(fee) || 0);
  if (!res || res.discount <= 0) {
    return { ok: false, error: 'Cupón no válido o no aplica a tu pedido.' };
  }
  return { ok: true, discount: res.discount, name: res.promo.name, code: code.trim() };
}

/* ── Contexto admin ─────────────────────────────────────────── */
type Ctx = { db: ReturnType<typeof createServiceClient>; restaurantId: string; userId: string };

async function adminCtx(restaurantIdFromForm?: string | null): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const isSuper = profile.role === 'SUPER_ADMIN';
  const restaurantId = isSuper ? (restaurantIdFromForm ?? '') : (profile.restaurant_id ?? '');
  if (!restaurantId) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'promociones')) return null;

  return { db: createServiceClient(), restaurantId, userId: user.id };
}

export type PromoState = { error: string } | { ok: true } | null;

const num = (v: FormDataEntryValue | null, def = 0) => {
  const n = parseFloat(String(v ?? ''));
  return isNaN(n) ? def : n;
};

function readPromoForm(formData: FormData) {
  const kind = String(formData.get('kind') ?? 'PERCENT');
  const rawCode = (formData.get('code') as string)?.trim();
  return {
    name: (formData.get('name') as string)?.trim() || '',
    kind: ['PERCENT', 'AMOUNT', 'FREE_DELIVERY'].includes(kind) ? kind : 'PERCENT',
    value: Math.max(0, num(formData.get('value'))),
    code: rawCode ? rawCode.toUpperCase() : null,
    min_order: Math.max(0, num(formData.get('min_order'))),
    starts_at: (formData.get('starts_at') as string) || null,
    ends_at: (formData.get('ends_at') as string) || null,
    active: formData.get('active') !== 'false',
    usage_limit: formData.get('usage_limit') ? Math.max(1, Math.trunc(num(formData.get('usage_limit')))) : null,
  };
}

export async function createPromotion(prevState: PromoState, formData: FormData): Promise<PromoState> {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const p = readPromoForm(formData);
  if (!p.name) return { error: 'Ponle un nombre a la promoción.' };
  if (p.kind === 'PERCENT' && (p.value <= 0 || p.value > 100)) return { error: 'El porcentaje debe estar entre 1 y 100.' };
  if (p.kind === 'AMOUNT' && p.value <= 0) return { error: 'El monto debe ser mayor a 0.' };

  const { error } = await ctx.db.from('promotions').insert({ restaurant_id: ctx.restaurantId, ...p });
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'Ya existe una promoción con ese código.' };
    }
    return { error: error.message };
  }

  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'promo', entity: p.name, meta: { kind: p.kind, value: p.value } });
  revalidatePath('/admin/promociones');
  return { ok: true };
}

export async function updatePromotion(prevState: PromoState, formData: FormData): Promise<PromoState> {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const id = (formData.get('id') as string)?.trim();
  if (!id) return { error: 'Promoción inválida.' };
  const p = readPromoForm(formData);
  if (!p.name) return { error: 'Ponle un nombre a la promoción.' };

  const { error } = await ctx.db.from('promotions').update(p).eq('id', id).eq('restaurant_id', ctx.restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/promociones');
  return { ok: true };
}

export async function togglePromotion(formData: FormData) {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;
  const id = (formData.get('id') as string)?.trim();
  const active = formData.get('active') === 'true';
  if (!id) return;
  await ctx.db.from('promotions').update({ active }).eq('id', id).eq('restaurant_id', ctx.restaurantId);
  revalidatePath('/admin/promociones');
}

export async function deletePromotion(formData: FormData) {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;
  const id = (formData.get('id') as string)?.trim();
  if (!id) return;
  await ctx.db.from('promotions').delete().eq('id', id).eq('restaurant_id', ctx.restaurantId);
  revalidatePath('/admin/promociones');
}
