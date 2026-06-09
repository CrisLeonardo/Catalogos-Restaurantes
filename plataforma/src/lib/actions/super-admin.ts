'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export type SuperState = { error: string } | null;

async function verifySuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'SUPER_ADMIN') return null;
  return createServiceClient();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createRestaurant(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre es requerido.' };

  const slug =
    (formData.get('slug') as string)?.trim() || slugify(name);
  if (!slug) return { error: 'No se pudo generar un slug válido.' };

  const { data: restaurant, error: rErr } = await db
    .from('restaurants')
    .insert({
      name,
      slug,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      whatsapp_number:
        (formData.get('whatsapp_number') as string)?.trim() || null,
      contact_email:
        (formData.get('contact_email') as string)?.trim() || null,
    })
    .select('id')
    .single();

  if (rErr) {
    if (
      rErr.message.includes('unique') ||
      rErr.message.includes('duplicate')
    ) {
      return { error: `El slug "${slug}" ya existe. Elige otro.` };
    }
    return { error: rErr.message };
  }

  await db.from('restaurant_themes').insert({
    restaurant_id: restaurant.id,
    brand_name: name,
  });

  revalidatePath('/super/restaurantes');
  redirect(`/super/restaurantes/${restaurant.id}?new=1`);
}

export async function updateRestaurantBasic(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre es requerido.' };

  const slug = (formData.get('slug') as string)?.trim();
  if (!slug) return { error: 'El slug es requerido.' };

  const { error } = await db
    .from('restaurants')
    .update({
      name,
      slug,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      whatsapp_number:
        (formData.get('whatsapp_number') as string)?.trim() || null,
      contact_email:
        (formData.get('contact_email') as string)?.trim() || null,
      status: formData.get('status') as string,
    })
    .eq('id', id);

  if (error) {
    if (
      error.message.includes('unique') ||
      error.message.includes('duplicate')
    ) {
      return { error: `El slug "${slug}" ya existe.` };
    }
    return { error: error.message };
  }

  revalidatePath('/super/restaurantes');
  revalidatePath(`/super/restaurantes/${id}`);
  redirect(`/super/restaurantes/${id}?saved=info`);
}

export async function updateRestaurantPlan(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const plan_actual = formData.get('plan_actual') as string;

  const modules = {
    catalog: true,
    orders: formData.get('module_orders') === 'true',
    whatsapp_notify: formData.get('module_whatsapp') === 'true',
  };

  const { error } = await db
    .from('restaurants')
    .update({ plan_actual, modules })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/super/restaurantes');
  revalidatePath(`/super/restaurantes/${id}`);
  redirect(`/super/restaurantes/${id}?saved=plan`);
}

export async function updateRestaurantThemeSuper(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const restaurantId = formData.get('restaurantId') as string;

  const { error } = await db
    .from('restaurant_themes')
    .update({
      brand_name:
        (formData.get('brand_name') as string)?.trim() || null,
      logo_url: (formData.get('logo_url') as string) || null,
      color_primary: formData.get('color_primary') as string,
      color_bg: formData.get('color_bg') as string,
      color_text: formData.get('color_text') as string,
      glass_intensity: formData.get('glass_intensity') as string,
      portada_style: formData.get('portada_style') as string,
      catalog_view: formData.get('catalog_view') as string,
    })
    .eq('restaurant_id', restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/super/restaurantes');
  revalidatePath(`/super/restaurantes/${restaurantId}`);
  redirect(`/super/restaurantes/${restaurantId}?saved=tema`);
}

export async function deleteRestaurant(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;

  const id = formData.get('id') as string;
  await db.from('restaurants').delete().eq('id', id);

  revalidatePath('/super/restaurantes');
  redirect('/super/restaurantes');
}

// ── Usuarios del restaurante (alta de dueños / staff) ──────────────
// El Super Admin crea el login con el que el dueño entrará a su panel.
// Usa la Admin API de Supabase (service_role) para crear el usuario en
// Auth y enlazar su `profile` con el restaurante y el rol.

export async function createRestaurantUser(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = (formData.get('password') as string) ?? '';
  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const role =
    (formData.get('role') as string) === 'RESTAURANT_STAFF'
      ? 'RESTAURANT_STAFF'
      : 'RESTAURANT_OWNER';

  if (!restaurantId) return { error: 'Restaurante inválido.' };
  if (!email || !email.includes('@')) return { error: 'Email inválido.' };
  if (password.length < 8)
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };

  // 1) Crear el usuario en Auth, ya confirmado (puede entrar de inmediato).
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created?.user) {
    const m = createErr?.message?.toLowerCase() ?? '';
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return { error: `Ya existe un usuario con el email ${email}.` };
    }
    return { error: createErr?.message ?? 'No se pudo crear el usuario.' };
  }

  // 2) Enlazar el profile con el restaurante y el rol.
  const { error: profErr } = await db.from('profiles').upsert({
    id: created.user.id,
    restaurant_id: restaurantId,
    role,
    full_name: fullName,
  });

  if (profErr) {
    // Rollback: no dejar un usuario de Auth huérfano sin profile.
    await db.auth.admin.deleteUser(created.user.id);
    return { error: profErr.message };
  }

  revalidatePath(`/super/restaurantes/${restaurantId}`);
  redirect(`/super/restaurantes/${restaurantId}?saved=user`);
}

export async function resetRestaurantUserPassword(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const userId = formData.get('userId') as string;
  const restaurantId = formData.get('restaurantId') as string;
  const password = (formData.get('password') as string) ?? '';

  if (password.length < 8)
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };

  // Verificar que el usuario pertenece a ESTE restaurante y no es super admin.
  const { data: prof } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', userId)
    .single();

  if (!prof || prof.role === 'SUPER_ADMIN' || prof.restaurant_id !== restaurantId)
    return { error: 'No autorizado.' };

  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  revalidatePath(`/super/restaurantes/${restaurantId}`);
  redirect(`/super/restaurantes/${restaurantId}?saved=pass`);
}

export async function deleteRestaurantUser(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;

  const userId = formData.get('userId') as string;
  const restaurantId = formData.get('restaurantId') as string;
  if (!userId) return;

  // Solo borrar logins de ESTE restaurante; nunca un super admin.
  const { data: prof } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', userId)
    .single();

  if (!prof || prof.role === 'SUPER_ADMIN' || prof.restaurant_id !== restaurantId)
    return;

  // Borra el usuario de Auth; el profile cae por FK on delete cascade.
  await db.auth.admin.deleteUser(userId);

  revalidatePath(`/super/restaurantes/${restaurantId}`);
}
