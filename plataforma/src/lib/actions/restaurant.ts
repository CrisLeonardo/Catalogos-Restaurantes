'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { HourInterval, WeeklyHours } from '@/lib/hours';
import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';

export type RestaurantState = { error: string } | null;

/**
 * Normalizes a Guatemala WhatsApp number to +502XXXXXXXX.
 * Accepts: "5555 0000", "55550000", "5555-0000", "+502 5555 0000", "50255550000".
 * Returns null for empty input, or an error string if the format is invalid.
 */
function normalizeWhatsApp(raw: string | null): { value: string | null } | { error: string } {
  if (!raw?.trim()) return { value: null };
  const digits = raw.replace(/[\s\-\(\)\+\.]/g, '');
  if (/^\d{8}$/.test(digits)) return { value: `+502${digits}` };
  if (/^502\d{8}$/.test(digits)) return { value: `+${digits}` };
  return {
    error: `Número inválido: "${raw}". Ingresa 8 dígitos (ej. 5555 0000) o +502 5555 0000`,
  };
}

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
  return { db, restaurantId, isSuperAdmin };
}

export async function updateRestaurantInfo(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'El nombre del restaurante es requerido.' };

  const waResult = normalizeWhatsApp(formData.get('whatsapp_number') as string | null);
  if ('error' in waResult) return { error: waResult.error };

  const ordersWaResult = normalizeWhatsApp(formData.get('orders_whatsapp') as string | null);
  if ('error' in ordersWaResult) return { error: ordersWaResult.error };

  const { error } = await ctx.db
    .from('restaurants')
    .update({
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      address: (formData.get('address') as string)?.trim() || null,
      whatsapp_number: waResult.value,
      orders_whatsapp: ordersWaResult.value,
      contact_email: (formData.get('contact_email') as string)?.trim() || null,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

/**
 * Apariencia del DUEÑO (modelo "Leonardo diseña"): el dueño solo controla
 * su logo y el color de acento. Se escribe en `config` (JSONB), que es lo
 * que el resolver realmente lee — las columnas legacy se sincronizan solo
 * para la lista del Super Admin. Así sus cambios ya no quedan enmascarados
 * por el editor completo del Super Admin.
 */
export async function updateRestaurantTheme(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const logoUrl = (formData.get('logo_url') as string) || null;
  const colorAccent = (formData.get('color_primary') as string)?.trim();
  if (colorAccent && !/^#[0-9a-fA-F]{3,8}$/.test(colorAccent)) {
    return { error: 'Color inválido.' };
  }

  // Merge sobre el config existente: NO pisar el diseño del Super Admin.
  const { data: row } = await ctx.db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', ctx.restaurantId)
    .single();

  const config = {
    ...((row?.config as Record<string, unknown>) ?? {}),
    logoUrl,
    ...(colorAccent ? { colorAccent } : {}),
  };

  const payload = {
    config,
    // Sincronía legacy (el punto de color en la lista del Super Admin).
    logo_url: logoUrl,
    ...(colorAccent ? { color_primary: colorAccent } : {}),
  };

  // El dueño solo tiene política RLS de UPDATE sobre su tema; el insert
  // (fila aún inexistente) solo ocurre vía Super Admin (service role).
  const { error } = row
    ? await ctx.db
        .from('restaurant_themes')
        .update(payload)
        .eq('restaurant_id', ctx.restaurantId)
    : await ctx.db
        .from('restaurant_themes')
        .upsert({ restaurant_id: ctx.restaurantId, ...payload }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

/* ── Operación: horarios, pausa de pedidos, zona horaria ──── */

function parseHours(raw: string | null): { hours: WeeklyHours | null } | { error: string } {
  if (!raw?.trim()) return { hours: null };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { error: 'Horario inválido.' };
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: 'Horario inválido.' };
  }

  const out: WeeklyHours = {};
  for (const [day, list] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day) || !Array.isArray(list)) return { error: 'Horario inválido.' };
    const intervals: HourInterval[] = [];
    for (const iv of list) {
      if (!Array.isArray(iv) || iv.length !== 2) return { error: 'Horario inválido.' };
      const [open, close] = iv as [unknown, unknown];
      if (
        typeof open !== 'string' || typeof close !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(open) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(close)
      ) {
        return { error: 'Las horas deben tener formato HH:MM.' };
      }
      intervals.push([open, close]);
    }
    if (intervals.length > 0) out[day as keyof WeeklyHours] = intervals;
  }
  // Sin ningún día con horario = "sin horario configurado" (siempre abierto).
  return { hours: Object.keys(out).length > 0 ? out : null };
}

/* ── Cobertura de delivery: zonas a las que llega el restaurante ── */

export async function updateDeliveryZones(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  let zones: string[] = [];
  try {
    const raw = JSON.parse((formData.get('zones') as string) || '[]');
    if (!Array.isArray(raw)) return { error: 'Zonas inválidas.' };
    zones = [...new Set(
      raw
        .filter((z): z is string => typeof z === 'string')
        .map((z) => z.trim().slice(0, 80))
        .filter(Boolean),
    )].slice(0, 60);
  } catch {
    return { error: 'Zonas inválidas.' };
  }

  const { error } = await ctx.db
    .from('restaurants')
    .update({ delivery_zones: zones.length > 0 ? zones : null })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

/* ── Geolocalización del restaurante + radio de entrega ─────── */

export async function updateRestaurantLocation(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const latRaw   = (formData.get('location_lat')       as string)?.trim();
  const lngRaw   = (formData.get('location_lng')       as string)?.trim();
  const radRaw   = (formData.get('delivery_radius_km') as string)?.trim();

  const lat    = latRaw   ? parseFloat(latRaw)   : null;
  const lng    = lngRaw   ? parseFloat(lngRaw)   : null;
  const radius = radRaw   ? parseFloat(radRaw)   : null;

  if (lat !== null && (isNaN(lat) || lat < -90  || lat > 90))
    return { error: 'Latitud inválida (debe estar entre -90 y 90).' };
  if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180))
    return { error: 'Longitud inválida (debe estar entre -180 y 180).' };
  if (radius !== null && (isNaN(radius) || radius <= 0 || radius > 500))
    return { error: 'Radio inválido (debe ser mayor a 0 y máximo 500 km).' };

  // Si se indica lat/lng, ambos son obligatorios
  if ((lat === null) !== (lng === null))
    return { error: 'Debes indicar tanto la latitud como la longitud.' };

  const { error } = await ctx.db
    .from('restaurants')
    .update({
      location_lat:       lat,
      location_lng:       lng,
      delivery_radius_km: radius,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  if (ctx.isSuperAdmin) {
    revalidatePath(`/super/restaurantes/${ctx.restaurantId}`);
    redirect(`/super/restaurantes/${ctx.restaurantId}?saved=location`);
  }
  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

export async function updateRestaurantOps(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const parsed = parseHours(formData.get('hours') as string | null);
  if ('error' in parsed) return { error: parsed.error };

  const timezone = (formData.get('timezone') as string)?.trim() || 'America/Guatemala';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return { error: 'Zona horaria inválida.' };
  }

  const { error } = await ctx.db
    .from('restaurants')
    .update({
      hours: parsed.hours,
      timezone,
      orders_paused: formData.get('orders_paused') === 'true',
      pause_message: (formData.get('pause_message') as string)?.trim() || null,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  redirect('/admin/perfil?saved=1');
}

export type SaveThemeResult = { error?: string; ok?: boolean };

export async function saveOrdersAndCurrency(input: {
  restaurantId: string;
  patch: Pick<ThemeConfig,
    'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
    'tipEnabled' | 'tipPercent' | 'acceptsCard' |
    'currencySymbol' | 'currencyPosition' | 'locale' | 'animations'
  > & Partial<Pick<ThemeConfig, 'floorPlan' | 'kdsYellowMin' | 'kdsRedMin' | 'kdsConfirmFirst'>>;
}): Promise<SaveThemeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'No autorizado.' };

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && profile.restaurant_id !== input.restaurantId) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const { data: row } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', input.restaurantId)
    .maybeSingle();

  const existingConfig = (row?.config as Record<string, unknown>) ?? {};
  const newConfig = { ...existingConfig, ...input.patch };

  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: input.restaurantId, config: newConfig }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/admin/personalizacion');
  revalidatePath('/admin/mesas');
  revalidatePath('/admin/mesero');
  revalidatePath('/');
  return { ok: true };
}

export async function updateOwnOrderTypes(
  restaurantId: string,
  orderTypes: ThemeConfig['orderTypes'],
): Promise<SaveThemeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'No autorizado.' };

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && profile.restaurant_id !== restaurantId) {
    return { error: 'No autorizado para este restaurante.' };
  }
  // Mínimo un tipo de pedido activo
  if (orderTypes.length === 0) return { error: 'Debe haber al menos un modo de pedido activo.' };

  const db = createServiceClient();
  const { data: row } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const existing = (row?.config as Record<string, unknown>) ?? {};
  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: restaurantId, config: { ...existing, orderTypes } }, { onConflict: 'restaurant_id' });
  if (error) return { error: error.message };

  // "Plan a tu medida": al cambiar canales, recalcula la mensualidad de los
  // restaurantes en modo automático (la función solo toca filas auto_price=true).
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  revalidatePath('/admin/modulos');
  revalidatePath('/admin/personalizacion');
  revalidatePath('/admin/mesas');
  revalidatePath('/admin/suscripcion');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Marca el onboarding guiado como completado (oculta el asistente del Inicio).
 * Solo el dueño de su propio restaurante (o super admin).
 */
export async function dismissOnboarding(restaurantId: string): Promise<SaveThemeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'No autorizado.' };

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && profile.restaurant_id !== restaurantId) {
    return { error: 'No autorizado para este restaurante.' };
  }

  const db = createServiceClient();
  const { error } = await db
    .from('restaurants')
    .update({ onboarding_done: true })
    .eq('id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin');
  return { ok: true };
}

export async function saveAdminRestaurantTheme(input: {
  restaurantId: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
}): Promise<SaveThemeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'No autorizado.' };

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && profile.restaurant_id !== input.restaurantId) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const { restaurantId, config, content, customCss } = input;

  // custom_css es CSS crudo (superficie de inyección): solo el Super Admin
  // puede definirlo (modelo "Leonardo diseña"). Para un dueño NO se toca —
  // se conserva el valor existente, ignorando lo que mande el cliente (la UI
  // ya le oculta el campo, pero el server action es el candado real).
  let effectiveCss: string | null;
  if (isSuperAdmin) {
    effectiveCss = customCss?.trim() ? customCss : null;
  } else {
    const { data: existing } = await db
      .from('restaurant_themes')
      .select('custom_css')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    effectiveCss = (existing?.custom_css as string | null) ?? null;
  }

  const legacyPortada = ['spotlight', 'poster', 'stack'].includes(config.portadaVariant)
    ? config.portadaVariant
    : 'spotlight';

  const { error } = await db
    .from('restaurant_themes')
    .upsert(
      {
        restaurant_id: restaurantId,
        config,
        content,
        custom_css: effectiveCss,
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

  revalidatePath('/admin/personalizacion');
  revalidatePath('/admin/perfil');
  revalidatePath('/');
  return { ok: true };
}
