'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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

export async function createProduct(prevState: ProductState, formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  const priceRaw = formData.get('price') as string;
  if (!name) return { error: 'El nombre es requerido.' };
  if (!priceRaw || isNaN(parseFloat(priceRaw))) return { error: 'El precio es requerido.' };

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
    tags: parseTags(formData.get('tags') as string),
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

  const { error } = await ctx.db
    .from('products')
    .update({
      category_id: (formData.get('category_id') as string) || null,
      name,
      description: (formData.get('description') as string)?.trim() || null,
      price: parseFloat(priceRaw),
      image_url: (formData.get('image_url') as string) || null,
      tags: parseTags(formData.get('tags') as string),
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
