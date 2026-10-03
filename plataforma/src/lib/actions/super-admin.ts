'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { verifySuperAdmin, currentSuperAdmin } from '@/lib/auth/super-admin-guard';
import { logSuper } from '@/lib/super-admin-log';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { PRICING_SETTINGS_TAG } from '@/lib/db/billing';
import { ACTIVATABLE_MODULES } from '@/lib/modules';
import { withPlanFloor, type PlanCode } from '@/lib/plans';
import { logChannelChanges } from '@/lib/db/channel-history';
import { slugify, validateSlug, crossSlugCollision, slugAliasOfOther } from '@/lib/slug';
import type { ThemeConfig, ThemeContent, OrderType } from '@/lib/theme/defaults';

export type SuperState = { error: string } | null;
export type SaveThemeResult = { error?: string; ok?: boolean };

// Generación/validación de slugs vive en lib/slug.ts (compartido con el
// registro self-serve para aplicar exactamente las mismas reglas).

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
  const usado = await slugAliasOfOther(db, slug);
  if (usado) return { error: usado };

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
  const usado = await slugAliasOfOther(db, slug, id);
  if (usado) return { error: usado };

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
  revalidatePath(`/super/restaurantes/${id}`, 'layout');
  redirect(`/super/restaurantes/${id}/informacion?saved=info`);
}

export async function updateRestaurantPlan(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const { db } = sesion;

  const id = formData.get('id') as string;
  const plan_actual = formData.get('plan_actual') as string;
  const VALID_PLANS = ['BASICO', 'ESTANDAR', 'PREMIUM', 'PRO'];
  if (!VALID_PLANS.includes(plan_actual)) return { error: 'Plan inválido.' };

  const feat = (key: string) => formData.get(`feature_${key}`) === 'true';
  // "Gestionado por Leogin" de cada módulo activable: true = forzado ON + oculto
  // del panel del restaurante. false/ausente = self-service (lo controla el dueño).
  const managedFlags = Object.fromEntries(
    ACTIVATABLE_MODULES.map((m) => [m.key, formData.get(`managed_${m.key}`) === 'true']),
  );
  // withPlanFloor garantiza que el jsonb nunca quede por DEBAJO de lo que el
  // plan promete. El formulario puede añadir (vender un módulo a la carta que
  // el plan no trae) pero no quitar: guardar un Premium sin Analítica dejaba
  // al cliente pagando Q349 con la sección desaparecida del panel — ni
  // accesible ni bloqueada, sin rastro de que faltaba.
  const modules = withPlanFloor(plan_actual as PlanCode, {
    catalog: true,
    orders:          feat('orders'),
    whatsapp_notify: feat('whatsapp_notify'),
    analitica:       feat('analitica'),
    inventario:      feat('inventario'),
    personal:        feat('personal'),
    finanzas:        feat('finanzas'),
    multi_branch:    feat('multi_branch'),
    ...managedFlags,
  });

  // El plan de ANTES se lee antes de pisarlo: sin eso la bitácora dice que
  // alguien cambió el plan pero no desde cuál, que es la mitad de la
  // pregunta cuando un cliente reclama su factura.
  const { data: previo } = await db
    .from('restaurants')
    .select('name, plan_actual')
    .eq('id', id)
    .maybeSingle();

  const { error } = await db
    .from('restaurants')
    .update({ plan_actual, modules })
    .eq('id', id);

  if (error) return { error: error.message };

  await logSuper(sesion, {
    action: 'restaurante.plan',
    targetRestaurantId: id,
    targetLabel: (previo?.name as string | null) ?? null,
    meta: { antes: previo?.plan_actual ?? null, despues: plan_actual },
  });

  // El plan determina el precio: refresca la mensualidad si está en automático.
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: id });

  revalidatePath('/super/restaurantes');
  revalidatePath(`/super/restaurantes/${id}`, 'layout');
  redirect(`/super/restaurantes/${id}/plan?saved=plan`);
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
  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  redirect(`/super/restaurantes/${restaurantId}/apariencia?saved=tema`);
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

  // Snapshot de orderTypes ANTES de sobrescribir — para el historial de
  // canales (mig. 073) que sostiene el descuento "Plan a tu medida".
  const { data: existingRow } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  const previousOrderTypes = (existingRow?.config as { orderTypes?: OrderType[] } | null)?.orderTypes ?? config.orderTypes;

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

  // Bitácora legible (activity_log) — el registro que sostiene el cobro
  // (restaurant_channel_log) lo escribe un trigger en restaurant_themes,
  // no esta llamada (ver channel-history.ts). Sin actor: verifySuperAdmin
  // ya validó la sesión pero no expone el user id, y no vale la pena un
  // segundo round-trip de auth solo para esta entrada informativa.
  await logChannelChanges(restaurantId, previousOrderTypes, config.orderTypes, null);

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
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

/** Suspender / reactivar en un clic (desde Finanzas → Cobranza). */
export async function setRestaurantStatusSuper(formData: FormData) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return;
  const { db } = sesion;

  const id = (formData.get('id') as string)?.trim();
  const status = formData.get('status') === 'suspended' ? 'suspended' : 'active';
  if (!id) return;

  const { data: previo } = await db.from('restaurants').select('name').eq('id', id).maybeSingle();
  await db.from('restaurants').update({ status }).eq('id', id);

  await logSuper(sesion, {
    action: 'restaurante.estado',
    targetRestaurantId: id,
    targetLabel: (previo?.name as string | null) ?? null,
    meta: { estado: status },
  });

  revalidatePath('/super/restaurantes');
  revalidatePath('/super/finanzas', 'layout');
  revalidatePath(`/super/restaurantes/${id}`, 'layout');
}

export async function deleteRestaurant(formData: FormData) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return;
  const { db } = sesion;

  const id = formData.get('id') as string;

  // El nombre se guarda ANTES de borrar. Después ya no existe, y una fila
  // que dijera solo «se borró el restaurante 3f2a…» no le explica nada a
  // nadie. Por lo mismo la tabla no tiene clave foránea aquí: si la
  // tuviera en cascada, este borrado se llevaría su propio registro.
  const { data: previo } = await db.from('restaurants').select('name, slug').eq('id', id).maybeSingle();

  await db.from('restaurants').delete().eq('id', id);

  await logSuper(sesion, {
    action: 'restaurante.borrar',
    targetRestaurantId: id,
    targetLabel: (previo?.name as string | null) ?? null,
    meta: { slug: previo?.slug ?? null },
  });

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
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const { db } = sesion;

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

  /* 3) Y su MEMBRESÍA (migración 113). Hallazgo A-09: esto solo escribía
     `profiles.restaurant_id`, el camino viejo, y el acceso nacía a medias —
     entraba a su panel bien, pero al abrir «Mi cuenta» no le salía ninguna
     tarjeta y la pantalla lo mandaba a /registro a crear un restaurante que
     ya tenía. El Super Admin podía fabricar una cuenta que el resto del
     producto no reconocía.

     Se escriben las DOS cosas, no una en vez de la otra: `restaurant_id`
     sigue siendo su «restaurante de casa» y lo miran el candado de tenant y
     el destino del login (lo dice la propia migración 113). */
  const { error: memberErr } = await db.from('restaurant_members').upsert(
    {
      user_id: created.user.id,
      restaurant_id: restaurantId,
      role: role === 'RESTAURANT_OWNER' ? 'OWNER' : 'STAFF',
      status: 'active',
    },
    { onConflict: 'user_id,restaurant_id' },
  );
  // Si la 113 no ha corrido en esta base, el acceso sirve igual por el camino
  // viejo: no se tira un alta que ya funciona por una fila de más.
  if (memberErr && !faltaLaTabla(memberErr)) {
    await db.auth.admin.deleteUser(created.user.id);
    return { error: memberErr.message };
  }

  await logSuper(sesion, {
    action: 'acceso.crear',
    targetUserId: created.user.id,
    targetRestaurantId: restaurantId,
    targetLabel: email,
    meta: { rol: role },
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  redirect(`/super/restaurantes/${restaurantId}/accesos?saved=user`);
}

export async function resetRestaurantUserPassword(
  prevState: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const { db } = sesion;

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

  if (!prof || prof.role === 'SUPER_ADMIN') return { error: 'No autorizado.' };

  /* Pertenecer es CUALQUIERA de las dos cosas. Con solo `restaurant_id` esto
     rechazaba justo a quien venía a rescatar: el dueño del modelo nuevo lo
     tiene en null y su vínculo vive en `restaurant_members` (migración 113).
     Así que el último recurso —"llama a Leogin y que te repongan la
     contraseña"— devolvía "No autorizado" y no quedaba ninguna salida. */
  let pertenece = prof.restaurant_id === restaurantId;
  if (!pertenece) {
    const { data: member } = await db
      .from('restaurant_members')
      .select('user_id')
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .maybeSingle();
    pertenece = !!member;
  }
  if (!pertenece) return { error: 'No autorizado.' };

  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  // La contraseña no se registra. Solo que se cambió, a quién y cuándo.
  const { data: quien } = await db.auth.admin.getUserById(userId);
  await logSuper(sesion, {
    action: 'acceso.contrasena',
    targetUserId: userId,
    targetRestaurantId: restaurantId,
    targetLabel: quien.user?.email ?? null,
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  redirect(`/super/restaurantes/${restaurantId}/accesos?saved=pass`);
}

export async function deleteRestaurantUser(formData: FormData) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return;
  const { db } = sesion;

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

  // El correo, antes de que deje de existir.
  const { data: quien } = await db.auth.admin.getUserById(userId);
  const correo = quien.user?.email ?? null;

  // Borra el usuario de Auth; el profile cae por FK on delete cascade.
  await db.auth.admin.deleteUser(userId);

  await logSuper(sesion, {
    action: 'acceso.quitar',
    targetUserId: userId,
    targetRestaurantId: restaurantId,
    targetLabel: correo,
  });

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
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

  const previousOrderTypes = (existing?.config as { orderTypes?: OrderType[] } | null)?.orderTypes ?? orderTypes;
  const mergedConfig = { ...(existing?.config ?? {}), orderTypes };

  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: restaurantId, config: mergedConfig }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };

  // Bitácora legible (activity_log) — el registro que sostiene el cobro
  // (restaurant_channel_log) lo escribe un trigger en restaurant_themes,
  // no esta llamada (ver channel-history.ts).
  await logChannelChanges(restaurantId, previousOrderTypes, orderTypes, null);

  revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
  return { ok: true };
}

/* ── Grupos / organizaciones (Fase E) ──────────────────────────────── */

/* Crear un grupo a mano se retiró: nace solo cuando alguien abre su segundo
   restaurante desde Mi cuenta (ver lib/db/organizations.ts). Lo que queda
   aquí es mover una sucursal de grupo o deshacer uno, que sigue siendo
   trabajo de soporte. */

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
  revalidatePath('/super/finanzas', 'layout');
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
  revalidatePath('/super/finanzas', 'layout');
}

/* Crear a mano la cuenta del "jefe del grupo" también se retiró. Era el
   modelo de "te creo la cuenta y te la paso": hoy quien abre los
   restaurantes ya es su dueño, y el consolidado lo ve desde su propia Mi
   cuenta sin credenciales aparte. */

export async function deleteOrganization(formData: FormData) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return;
  const { db } = sesion;
  const id = (formData.get('id') as string)?.trim();
  if (!id) return;
  const { data: previo } = await db.from('organizations').select('name').eq('id', id).maybeSingle();
  // Las sucursales quedan independientes (organization_id → null por FK).
  await db.from('organizations').delete().eq('id', id);

  await logSuper(sesion, {
    action: 'grupo.borrar',
    targetLabel: (previo?.name as string | null) ?? null,
    meta: { organizationId: id },
  });

  revalidatePath('/super/grupos');
  redirect('/super/grupos');
}

/* ── Configuración de la plataforma (datos de soporte) ─────────────── */

export interface PlatformContactSettings {
  support_whatsapp: string;
  support_email: string;
  /** Cómo pagan los restaurantes su mensualidad (banco, cuenta, a nombre de
   *  quién). Se les enseña en Mi suscripción cuando tienen algo pendiente. */
  payment_instructions: string;
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
    payment_instructions: (map.payment_instructions as string) ?? '',
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
  const pago = String(formData.get('payment_instructions') ?? '').trim();
  if (pago.length > 600) return { error: 'Las instrucciones de pago son muy largas (máximo 600 caracteres).' };

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: 'El correo electrónico no es válido.' };

  if (whatsapp && !/^\+?[\d\s\-()+]{7,20}$/.test(whatsapp))
    return { error: 'El número de WhatsApp no es válido (solo dígitos, +, espacios y guiones).' };

  const { error } = await db.from('platform_settings').upsert(
    [
      { key: 'support_whatsapp', value: whatsapp },
      { key: 'support_email', value: email },
      { key: 'payment_instructions', value: pago },
    ],
    { onConflict: 'key' },
  );

  if (error) return { error: error.message };

  // Estas claves viven en la misma fila que lee getPricingSettings(), que
  // cachea `platform_settings` entera entre peticiones: hay que invalidar
  // aunque lo guardado aquí sea el contacto de soporte y no un precio.
  updateTag(PRICING_SETTINGS_TAG);
  revalidatePath('/super/configuracion');
  revalidatePath('/admin/ayuda');
  revalidatePath('/admin/suscripcion');
  return { saved: true };
}
