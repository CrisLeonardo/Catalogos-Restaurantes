'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ThemeConfig, ThemeContent, OrderType } from '@/lib/theme/defaults';

export type SuperState = { error: string } | null;
export type SaveThemeResult = { error?: string; ok?: boolean };

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

// Subdominios que no pueden ser de un restaurante: `demo` es la demo pública
// de Leogin y `www` se trata como dominio raíz en lib/tenant.ts.
const RESERVED_SLUGS = ['demo', 'www', 'admin', 'api', 'app', 'super', 'preview', 'login', 'central'];

/** Valida un slug de subdominio; devuelve mensaje de error o null si es válido. */
function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return 'El slug solo puede tener minúsculas, números y guiones (sin espacios ni acentos).';
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `El slug "${slug}" está reservado por la plataforma. Elige otro.`;
  }
  // Estos sufijos son subdominios especiales (panel admin / panel de grupo).
  if (slug.endsWith('-admin') || slug.endsWith('-central')) {
    return `El slug no puede terminar en "-admin" ni "-central" (son subdominios reservados).`;
  }
  return null;
}

/**
 * El subdominio (slug) es un namespace COMPARTIDO entre restaurantes y grupos:
 * `grupo-slug.dominio` solo enruta al selector de sucursal si NINGÚN restaurante
 * usa ese slug (el restaurante gana). Esta verificación cruzada evita esa colisión.
 * `table` es la tabla donde se va a guardar; se revisa la OTRA. null = sin colisión.
 */
async function crossSlugCollision(
  db: ReturnType<typeof createServiceClient>,
  slug: string,
  table: 'restaurants' | 'organizations',
): Promise<string | null> {
  const other = table === 'restaurants' ? 'organizations' : 'restaurants';
  const { data } = await db.from(other).select('id').eq('slug', slug).maybeSingle();
  if (!data) return null;
  return other === 'organizations'
    ? `El slug "${slug}" ya lo usa un grupo. Elige otro.`
    : `El slug "${slug}" ya lo usa una sucursal. Elige otro.`;
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
    (formData.get('slug') as string)?.trim().toLowerCase() || slugify(name);
  if (!slug) return { error: 'No se pudo generar un slug válido.' };
  const slugError = validateSlug(slug);
  if (slugError) return { error: slugError };
  const collision = await crossSlugCollision(db, slug, 'restaurants');
  if (collision) return { error: collision };

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

  // Cobro listo desde el día 1: modo automático según el plan (default Básico).
  // El precio se calcula y guarda con leogin_apply_auto_price (mig. 035).
  await db.from('restaurant_billing').insert({
    restaurant_id: restaurant.id,
    auto_price: true,
    active: true,
  });
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurant.id });

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

  const slug = (formData.get('slug') as string)?.trim().toLowerCase();
  if (!slug) return { error: 'El slug es requerido.' };
  const slugError = validateSlug(slug);
  if (slugError) return { error: slugError };
  const collision = await crossSlugCollision(db, slug, 'restaurants');
  if (collision) return { error: collision };

  const { error } = await db
    .from('restaurants')
    .update({
      name,
      slug,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      address: (formData.get('address') as string)?.trim() || null,
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

  const bool = (key: string) => formData.get(key) === 'true';
  const modules = {
    catalog: true,
    orders:         bool('module_orders'),
    whatsapp_notify:bool('module_whatsapp'),
    analitica:      bool('module_analitica'),
    inventario:     bool('module_inventario'),
    promociones:    bool('module_promociones'),
    personal:       bool('module_personal'),
    finanzas:       bool('module_finanzas'),
    multi_branch:   bool('module_multi_branch'),
    fel:            bool('module_fel'),
    proveedores:    bool('module_proveedores'),
    loyalty:        bool('module_loyalty'),
  };

  const { error } = await db
    .from('restaurants')
    .update({ plan_actual, modules })
    .eq('id', id);

  if (error) return { error: error.message };

  // El plan determina el precio: refresca la mensualidad si está en automático.
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: id });

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

/**
 * Motor de personalización: guarda el tema completo (config + content + custom_css).
 * Recibe objetos serializables directamente (no FormData) desde el editor cliente.
 * Sincroniza además las columnas legacy para la lista y compatibilidad.
 */
export async function saveRestaurantTheme(input: {
  restaurantId: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
}): Promise<SaveThemeResult> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const { restaurantId, config, content, customCss } = input;
  if (!restaurantId) return { error: 'Restaurante inválido.' };

  const legacyPortada = ['spotlight', 'poster', 'stack'].includes(config.portadaVariant)
    ? config.portadaVariant
    : 'spotlight';

  // upsert: crea la fila de tema si el restaurante aún no tiene una.
  const { error } = await db
    .from('restaurant_themes')
    .upsert(
      {
        restaurant_id: restaurantId,
        config,
        content,
        custom_css: customCss?.trim() ? customCss : null,
        // Sincronía legacy (lista del super admin + compatibilidad de lectura)
        brand_name: config.brandName || null,
        logo_url: config.logoUrl || null,
        color_primary: config.colorAccent,
        color_bg: config.colorBg,
        color_text: config.colorText,
        font_display: config.fontDisplay,
        portada_style: legacyPortada,
        catalog_view: config.catalogView,
        glass_intensity: config.glassIntensity,
        background_image: config.backgroundImage,
      },
      { onConflict: 'restaurant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/super/restaurantes/${restaurantId}`);
  revalidatePath('/super/restaurantes');
  return { ok: true };
}

/* ── Plantillas de tema ─────────────────────────────────────
   Guardas un diseño que te gustó y lo aplicas a otro restaurante
   en un clic. Acelera el flujo "Leonardo diseña". */

export interface ThemeTemplate {
  id: string;
  name: string;
  config: ThemeConfig;
  content: ThemeContent;
  custom_css: string | null;
  created_at: string;
}

export async function listThemeTemplates(): Promise<ThemeTemplate[]> {
  const db = await verifySuperAdmin();
  if (!db) return [];
  const { data } = await db
    .from('theme_templates')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as ThemeTemplate[];
}

export async function saveThemeTemplate(input: {
  name: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
}): Promise<{ error?: string; template?: ThemeTemplate }> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const name = input.name?.trim();
  if (!name) return { error: 'Ponle un nombre a la plantilla.' };
  if (name.length > 80) return { error: 'Nombre demasiado largo.' };

  const { data, error } = await db
    .from('theme_templates')
    .insert({
      name,
      config: input.config,
      content: input.content,
      custom_css: input.customCss?.trim() ? input.customCss : null,
    })
    .select('*')
    .single();

  if (error) return { error: error.message };
  return { template: data as ThemeTemplate };
}

export async function deleteThemeTemplate(id: string): Promise<{ error?: string }> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const { error } = await db.from('theme_templates').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

/* ── Duplicar restaurante ───────────────────────────────────
   Copia tema + categorías + productos a un restaurante nuevo
   (suspendido, sin usuarios) para arrancar un cliente en minutos. */

export async function duplicateRestaurant(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;

  const id = formData.get('id') as string;
  if (!id) return;

  const [{ data: source }, { data: theme }, { data: categories }, { data: products }] =
    await Promise.all([
      db.from('restaurants').select('*').eq('id', id).single(),
      db.from('restaurant_themes').select('*').eq('restaurant_id', id).single(),
      db.from('categories').select('*').eq('restaurant_id', id).order('sort_order'),
      db.from('products').select('*').eq('restaurant_id', id).order('sort_order'),
    ]);

  if (!source) return;

  // Slug único: base-copia, base-copia-2, …
  const base = `${source.slug}-copia`.slice(0, 56);
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const { data: clash } = await db
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${base}-${n}`;
  }

  const { data: copy, error: copyErr } = await db
    .from('restaurants')
    .insert({
      name: `${source.name} (copia)`,
      slug,
      tagline: source.tagline,
      plan_actual: source.plan_actual,
      modules: source.modules,
      // Suspendido: no queda público hasta que lo actives a propósito.
      status: 'suspended',
      whatsapp_number: source.whatsapp_number,
      contact_email: source.contact_email,
      timezone: source.timezone,
      hours: source.hours,
      orders_paused: false,
      pause_message: source.pause_message,
    })
    .select('id')
    .single();

  if (copyErr || !copy) return;

  if (theme) {
    const themeCopy = { ...theme, restaurant_id: copy.id };
    await db.from('restaurant_themes').insert(themeCopy);
  }

  // Categorías (mapa id viejo → nuevo) y luego productos remapeados.
  const catMap = new Map<string, string>();
  for (const cat of categories ?? []) {
    const { data: newCat } = await db
      .from('categories')
      .insert({
        restaurant_id: copy.id,
        name: cat.name,
        icon: cat.icon,
        sort_order: cat.sort_order,
        is_active: cat.is_active,
      })
      .select('id')
      .single();
    if (newCat) catMap.set(cat.id as string, newCat.id as string);
  }

  if (products && products.length > 0) {
    await db.from('products').insert(
      products.map((p) => ({
        restaurant_id: copy.id,
        category_id: p.category_id ? catMap.get(p.category_id as string) ?? null : null,
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url,
        icon: p.icon,
        tags: p.tags,
        options: p.options,
        is_available: p.is_available,
        sort_order: p.sort_order,
      })),
    );
  }

  revalidatePath('/super/restaurantes');
  redirect(`/super/restaurantes/${copy.id}?new=1`);
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

/**
 * Actualiza solo los tipos de pedido activos (comer aquí / domicilio / retiro)
 * sin tocar el resto de la configuración del tema.
 */
export async function updateOrderTypes(
  restaurantId: string,
  orderTypes: OrderType[],
): Promise<{ error?: string; ok?: boolean }> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  if (!restaurantId) return { error: 'Restaurante inválido.' };

  // Leemos la config existente para hacer un merge parcial (no pisar otros campos).
  const { data: existing } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const mergedConfig = { ...(existing?.config ?? {}), orderTypes };

  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: restaurantId, config: mergedConfig }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };

  revalidatePath(`/super/restaurantes/${restaurantId}`);
  return { ok: true };
}

/* ── Grupos / organizaciones (Fase E) ──────────────────────────────── */

export async function createOrganization(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre del grupo es requerido.' };

  const slug = (formData.get('slug') as string)?.trim().toLowerCase() || slugify(name);
  const slugError = validateSlug(slug);
  if (slugError) return { error: slugError };
  const collision = await crossSlugCollision(db, slug, 'organizations');
  if (collision) return { error: collision };

  const { data: org, error } = await db
    .from('organizations')
    .insert({
      name,
      slug,
      contact_email: (formData.get('contact_email') as string)?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      return { error: `El slug "${slug}" ya existe. Elige otro.` };
    }
    return { error: error.message };
  }

  revalidatePath('/super/grupos');
  redirect(`/super/grupos/${org.id}`);
}

export async function assignRestaurantToOrg(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;
  const orgId = (formData.get('orgId') as string)?.trim();
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  if (!orgId || !restaurantId) return;
  await db.from('restaurants').update({ organization_id: orgId }).eq('id', restaurantId);
  // El conteo de sucursales Premium cambió → recalcula precios automáticos.
  await db.rpc('leogin_apply_auto_price_all');
  revalidatePath(`/super/grupos/${orgId}`);
  revalidatePath('/super/cobros');
}

export async function unassignRestaurant(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;
  const orgId = (formData.get('orgId') as string)?.trim();
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  if (!restaurantId) return;
  await db.from('restaurants').update({ organization_id: null }).eq('id', restaurantId);
  // El conteo de sucursales Premium cambió → recalcula precios automáticos.
  await db.rpc('leogin_apply_auto_price_all');
  if (orgId) revalidatePath(`/super/grupos/${orgId}`);
  revalidatePath('/super/cobros');
}

export async function createGroupOwner(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const orgId = (formData.get('orgId') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = (formData.get('password') as string) ?? '';
  const fullName = (formData.get('full_name') as string)?.trim() || null;

  if (!orgId) return { error: 'Grupo inválido.' };
  if (!email || !email.includes('@')) return { error: 'Email inválido.' };
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (createErr || !created?.user) {
    const m = createErr?.message?.toLowerCase() ?? '';
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return { error: `Ya existe un usuario con el email ${email}.` };
    }
    return { error: createErr?.message ?? 'No se pudo crear el usuario.' };
  }

  const { error: profErr } = await db.from('profiles').upsert({
    id: created.user.id,
    role: 'GROUP_OWNER',
    organization_id: orgId,
    restaurant_id: null,
    full_name: fullName,
  });
  if (profErr) {
    await db.auth.admin.deleteUser(created.user.id);
    return { error: profErr.message };
  }

  revalidatePath(`/super/grupos/${orgId}`);
  redirect(`/super/grupos/${orgId}?saved=owner`);
}

export async function deleteOrganization(formData: FormData) {
  const db = await verifySuperAdmin();
  if (!db) return;
  const id = (formData.get('id') as string)?.trim();
  if (!id) return;
  // Las sucursales quedan independientes (organization_id → null por FK).
  await db.from('organizations').delete().eq('id', id);
  revalidatePath('/super/grupos');
  redirect('/super/grupos');
}

/* ── Configuración de la plataforma (datos de soporte) ─────────────── */

export interface PlatformContactSettings {
  support_whatsapp: string;
  support_email: string;
}

/** Lee los datos de contacto del soporte desde platform_settings. */
export async function getPlatformContactSettings(): Promise<PlatformContactSettings> {
  const db = createServiceClient();
  const { data } = await db.from('platform_settings').select('key, value');
  const map = Object.fromEntries(
    (data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  );
  return {
    support_whatsapp: (map.support_whatsapp as string) ?? '',
    support_email: (map.support_email as string) ?? '',
  };
}

export type PlatformSettingsState = { saved: true } | { error: string } | null;

/** Guarda los datos de contacto del soporte (solo Super Admin). */
export async function savePlatformSettings(
  prevState: PlatformSettingsState,
  formData: FormData,
): Promise<PlatformSettingsState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const whatsapp = String(formData.get('support_whatsapp') ?? '').trim();
  const email = String(formData.get('support_email') ?? '').trim();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: 'El correo electrónico no es válido.' };

  if (whatsapp && !/^\+?[\d\s\-()+]{7,20}$/.test(whatsapp))
    return { error: 'El número de WhatsApp no es válido (solo dígitos, +, espacios y guiones).' };

  const { error } = await db.from('platform_settings').upsert(
    [
      { key: 'support_whatsapp', value: whatsapp },
      { key: 'support_email', value: email },
    ],
    { onConflict: 'key' },
  );

  if (error) return { error: error.message };

  revalidatePath('/super/configuracion');
  revalidatePath('/admin/soporte');
  return { saved: true };
}
