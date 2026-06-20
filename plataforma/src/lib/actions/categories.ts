'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';

async function resolveContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // Un staff sin permiso "categorias" no puede modificarlas (candado server-side).
  if (!can(profile.role, profile.permissions as string[] | null, 'categorias')) return null;

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  const restaurantId = isSuperAdmin
    ? (formData.get('restaurantId') as string)
    : profile.restaurant_id;

  if (!restaurantId) return null;

  const db = isSuperAdmin ? createServiceClient() : supabase;
  return { db, restaurantId, role: profile.role };
}

function revalidateAll() {
  revalidatePath('/admin/menu');
  revalidatePath('/admin/categorias');
}

export async function toggleCategoryActive(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const is_active = formData.get('is_active') === 'true';

  await ctx.db
    .from('categories')
    .update({ is_active })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidateAll();
}

export async function moveCategoryUp(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);

  const { data: prev } = await ctx.db
    .from('categories')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .lt('sort_order', currentOrder)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  if (!prev) return;

  await Promise.all([
    ctx.db.from('categories').update({ sort_order: prev.sort_order }).eq('id', id),
    ctx.db.from('categories').update({ sort_order: currentOrder }).eq('id', prev.id),
  ]);

  revalidateAll();
}

export async function moveCategoryDown(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);

  const { data: next } = await ctx.db
    .from('categories')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .gt('sort_order', currentOrder)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single();

  if (!next) return;

  await Promise.all([
    ctx.db.from('categories').update({ sort_order: next.sort_order }).eq('id', id),
    ctx.db.from('categories').update({ sort_order: currentOrder }).eq('id', next.id),
  ]);

  revalidateAll();
}

/* ── Modal actions (sin redirect, para CategoriesPanel en /admin/categorias) ─ */

export type CatModalState = { success: true } | { error: string } | null;

export async function createCategoryModal(
  prevState: CatModalState,
  formData: FormData,
): Promise<CatModalState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre es requerido.' };

  const { data: existing } = await ctx.db
    .from('categories')
    .select('sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const { error } = await ctx.db.from('categories').insert({
    restaurant_id: ctx.restaurantId,
    name,
    icon: (formData.get('icon') as string) || null,
    sort_order,
  });

  if (error) return { error: error.message };

  revalidateAll();
  return { success: true };
}

export async function updateCategoryModal(
  prevState: CatModalState,
  formData: FormData,
): Promise<CatModalState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre es requerido.' };

  const { error } = await ctx.db
    .from('categories')
    .update({ name, icon: (formData.get('icon') as string) || null })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidateAll();
  return { success: true };
}

export async function deleteCategoryModal(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;

  await ctx.db
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidateAll();
}
