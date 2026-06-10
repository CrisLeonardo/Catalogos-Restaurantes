'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ProductOptionGroup } from '@/types';

export type ProductState = { error: string } | null;

async function resolveContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  const restaurantId = isSuperAdmin
    ? (formData.get('restaurantId') as string)
    : profile.restaurant_id;

  if (!restaurantId) return null;

  const db = isSuperAdmin ? createServiceClient() : supabase;
  return { db, restaurantId, role: profile.role };
}

function parseTags(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Valida los grupos de variantes/extras que manda el editor del admin.
 * Estructura final: [{ id, name, type, required?, max?, choices: [{ id, name, priceDelta }] }]
 * Devuelve null si no hay grupos válidos (producto simple).
 */
function parseOptions(raw: string | null): ProductOptionGroup[] | null | { error: string } {
  if (!raw?.trim() || raw.trim() === '[]') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'Variantes inválidas.' };
  }
  if (!Array.isArray(data)) return { error: 'Variantes inválidas.' };
  if (data.length > 10) return { error: 'Máximo 10 grupos de opciones.' };

  const out: ProductOptionGroup[] = [];
  for (const g of data as Record<string, unknown>[]) {
    const name = typeof g.name === 'string' ? g.name.trim().slice(0, 60) : '';
    const type = g.type === 'multi' ? 'multi' : 'single';
    const id = typeof g.id === 'string' && g.id ? g.id.slice(0, 60) : Math.random().toString(36).slice(2, 9);
    if (!name || !Array.isArray(g.choices)) continue;
    if (g.choices.length > 20) return { error: 'Máximo 20 opciones por grupo.' };

    const choices = (g.choices as Record<string, unknown>[])
      .map((c) => ({
        id: typeof c.id === 'string' && c.id ? c.id.slice(0, 60) : Math.random().toString(36).slice(2, 9),
        name: typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '',
        priceDelta: Math.max(-100_000, Math.min(100_000, Number(c.priceDelta) || 0)),
      }))
      .filter((c) => c.name.length > 0);
    if (choices.length === 0) continue;

    out.push({
      id,
      name,
      type,
      ...(type === 'single' ? { required: g.required === true } : {}),
      ...(type === 'multi' ? { max: Math.max(0, Math.min(20, Number(g.max) || 0)) } : {}),
      choices,
    });
  }
  return out.length > 0 ? out : null;
}

export async function createProduct(prevState: ProductState, formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  const priceRaw = formData.get('price') as string;
  if (!name) return { error: 'El nombre es requerido.' };
  if (!priceRaw || isNaN(parseFloat(priceRaw))) return { error: 'El precio es requerido.' };

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  const { data: existing } = await ctx.db
    .from('products')
    .select('sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const { error } = await ctx.db.from('products').insert({
    restaurant_id: ctx.restaurantId,
    category_id: (formData.get('category_id') as string) || null,
    name,
    description: (formData.get('description') as string)?.trim() || null,
    price: parseFloat(priceRaw),
    image_url: (formData.get('image_url') as string) || null,
    icon: (formData.get('icon') as string) || null,
    tags: parseTags(formData.get('tags') as string),
    options,
    is_available: formData.get('is_available') === 'true',
    sort_order,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/menu');
  redirect('/admin/menu');
}

export async function updateProduct(prevState: ProductState, formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  const priceRaw = formData.get('price') as string;
  if (!name) return { error: 'El nombre es requerido.' };
  if (!priceRaw || isNaN(parseFloat(priceRaw))) return { error: 'El precio es requerido.' };

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  const { error } = await ctx.db
    .from('products')
    .update({
      category_id: (formData.get('category_id') as string) || null,
      name,
      description: (formData.get('description') as string)?.trim() || null,
      price: parseFloat(priceRaw),
      image_url: (formData.get('image_url') as string) || null,
      icon: (formData.get('icon') as string) || null,
      tags: parseTags(formData.get('tags') as string),
      options,
      is_available: formData.get('is_available') === 'true',
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/menu');
  redirect('/admin/menu');
}

export async function deleteProduct(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;

  await ctx.db
    .from('products')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/menu');
}

export async function toggleProductAvailability(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const is_available = formData.get('is_available') === 'true';

  await ctx.db
    .from('products')
    .update({ is_available })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/menu');
}

export async function moveProductUp(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);
  const categoryId = formData.get('category_id') as string | null;

  let query = ctx.db
    .from('products')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .lt('sort_order', currentOrder)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (categoryId) query = query.eq('category_id', categoryId);
  else query = query.is('category_id', null);

  const { data: prev } = await query.single();
  if (!prev) return;

  await Promise.all([
    ctx.db.from('products').update({ sort_order: prev.sort_order }).eq('id', id),
    ctx.db.from('products').update({ sort_order: currentOrder }).eq('id', prev.id),
  ]);

  revalidatePath('/admin/menu');
}

export async function moveProductDown(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);
  const categoryId = formData.get('category_id') as string | null;

  let query = ctx.db
    .from('products')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .gt('sort_order', currentOrder)
    .order('sort_order', { ascending: true })
    .limit(1);

  if (categoryId) query = query.eq('category_id', categoryId);
  else query = query.is('category_id', null);

  const { data: next } = await query.single();
  if (!next) return;

  await Promise.all([
    ctx.db.from('products').update({ sort_order: next.sort_order }).eq('id', id),
    ctx.db.from('products').update({ sort_order: currentOrder }).eq('id', next.id),
  ]);

  revalidatePath('/admin/menu');
}

/* ── Modal actions (sin redirect, retornan { success } para uso en modales) ── */

export type ProductModalState = { success: true } | { error: string } | null;

export async function createProductModal(
  prevState: ProductModalState,
  formData: FormData,
): Promise<ProductModalState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  const priceRaw = formData.get('price') as string;
  if (!name) return { error: 'El nombre es requerido.' };
  if (!priceRaw || isNaN(parseFloat(priceRaw))) return { error: 'El precio es requerido.' };

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  const { data: existing } = await ctx.db
    .from('products')
    .select('sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const { error } = await ctx.db.from('products').insert({
    restaurant_id: ctx.restaurantId,
    category_id: (formData.get('category_id') as string) || null,
    name,
    description: (formData.get('description') as string)?.trim() || null,
    price: parseFloat(priceRaw),
    image_url: (formData.get('image_url') as string) || null,
    icon: (formData.get('icon') as string) || null,
    tags: parseTags(formData.get('tags') as string),
    options,
    is_available: formData.get('is_available') === 'true',
    sort_order,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/menu');
  return { success: true };
}

export async function updateProductModal(
  prevState: ProductModalState,
  formData: FormData,
): Promise<ProductModalState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  const priceRaw = formData.get('price') as string;
  if (!name) return { error: 'El nombre es requerido.' };
  if (!priceRaw || isNaN(parseFloat(priceRaw))) return { error: 'El precio es requerido.' };

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  const { error } = await ctx.db
    .from('products')
    .update({
      category_id: (formData.get('category_id') as string) || null,
      name,
      description: (formData.get('description') as string)?.trim() || null,
      price: parseFloat(priceRaw),
      image_url: (formData.get('image_url') as string) || null,
      icon: (formData.get('icon') as string) || null,
      tags: parseTags(formData.get('tags') as string),
      options,
      is_available: formData.get('is_available') === 'true',
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/menu');
  return { success: true };
}
