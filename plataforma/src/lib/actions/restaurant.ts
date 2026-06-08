'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export type RestaurantState = { error: string } | null;

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
  return { db, restaurantId };
}

export async function updateRestaurantInfo(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre del restaurante es requerido.' };

  const { error } = await ctx.db
    .from('restaurants')
    .update({
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      whatsapp_number: (formData.get('whatsapp_number') as string)?.trim() || null,
      contact_email: (formData.get('contact_email') as string)?.trim() || null,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

export async function updateRestaurantTheme(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const { error } = await ctx.db
    .from('restaurant_themes')
    .update({
      brand_name: (formData.get('brand_name') as string)?.trim() || null,
      logo_url: (formData.get('logo_url') as string) || null,
      color_primary: formData.get('color_primary') as string,
      color_bg: formData.get('color_bg') as string,
      color_text: formData.get('color_text') as string,
      glass_intensity: formData.get('glass_intensity') as string,
      portada_style: formData.get('portada_style') as string,
      catalog_view: formData.get('catalog_view') as string,
    })
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}
