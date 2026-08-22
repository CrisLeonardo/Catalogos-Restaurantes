'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId, canActOnGroupBranch } from '@/lib/db/admin';
import { canActOnRestaurant, resolveOwnRestaurantId } from '@/lib/db/membership';
import { logChannelChanges } from '@/lib/db/channel-history';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { HourInterval, WeeklyHours, HourExceptions } from '@/lib/hours';
import type { ThemeConfig, ThemeContent, OrderType } from '@/lib/theme/defaults';
import { extractVisualConfig, type TemplateConfig } from '@/lib/theme/templates';
import { ESTANDAR_MAX_ORDER_TYPES } from '@/lib/plans';

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
  // Sucursal del grupo que administra, si administra alguno (migración 116).
  const groupBranchId = isSuperAdmin ? null : await resolveGroupBranchId();
  const isGroupOwner = groupBranchId !== null;
  const restaurantId = isSuperAdmin
    ? (formData.get('restaurantId') as string)
    : (groupBranchId ?? (await resolveOwnRestaurantId(profile.restaurant_id)));

  if (!restaurantId) return null;

  // `isSuperAdmin` se mantiene estricto (controla el redirect al panel /super);
  // el dueño de grupo usa el cliente elevado pero sigue el flujo de /admin.
  const db = (isSuperAdmin || isGroupOwner) ? createServiceClient() : supabase;
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
      orders_whatsapp_enabled: formData.get('orders_whatsapp_enabled') === 'true',
      contact_email: (formData.get('contact_email') as string)?.trim() || null,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  updateTag(`restaurant:${ctx.restaurantId}`);
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
  updateTag(`restaurant:${ctx.restaurantId}`);
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

/** Excepciones puntuales por fecha (feriados) — mismo formato que parseHours pero con clave "YYYY-MM-DD". */
function parseHourExceptions(raw: string | null): { exceptions: HourExceptions | null } | { error: string } {
  if (!raw?.trim()) return { exceptions: null };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { error: 'Excepciones de horario inválidas.' };
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: 'Excepciones de horario inválidas.' };
  }

  const out: HourExceptions = {};
  for (const [date, list] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(list)) {
      return { error: 'Excepciones de horario inválidas.' };
    }
    const intervals: HourInterval[] = [];
    for (const iv of list) {
      if (!Array.isArray(iv) || iv.length !== 2) return { error: 'Excepciones de horario inválidas.' };
      const [open, close] = iv as [unknown, unknown];
      if (
        typeof open !== 'string' || typeof close !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(open) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(close)
      ) {
        return { error: 'Las horas de las excepciones deben tener formato HH:MM.' };
      }
      intervals.push([open, close]);
    }
    out[date] = intervals; // [] = cerrado ese día (feriado completo)
  }
  return { exceptions: Object.keys(out).length > 0 ? out : null };
}

/* ── Cobertura de delivery: zonas a las que llega el restaurante ── */

export async function updateDeliveryZones(
  prevState: RestaurantState,
  formData: FormData,
): Promise<RestaurantState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  // Desde la migración 104 las zonas viven en su propia tabla y traen tarifa.
  // El formulario manda [{nombre, tarifa}]; se sanea todo aquí porque la
  // tarifa es dinero y no se confía en lo que llega del cliente.
  const zones: { nombre: string; tarifa: number }[] = [];
  try {
    const raw = JSON.parse((formData.get('zones') as string) || '[]');
    if (!Array.isArray(raw)) return { error: 'Zonas inválidas.' };

    const vistos = new Set<string>();
    for (const z of raw) {
      const nombre = typeof z?.nombre === 'string' ? z.nombre.trim().slice(0, 80) : '';
      if (!nombre) continue;
      const clave = nombre.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const tarifaNum = Number(z?.tarifa);
      zones.push({
        nombre,
        tarifa: Number.isFinite(tarifaNum) && tarifaNum > 0 ? Math.min(tarifaNum, 99999) : 0,
      });
      if (zones.length >= 60) break;
    }
  } catch {
    return { error: 'Zonas inválidas.' };
  }

  // Las filas NO se borran: orders.delivery_zone_id las referencia y un pedido
  // viejo no puede quedarse sin la zona con la que se cobró. Lo que desaparece
  // del formulario se desactiva.
  const { data: existentes } = await ctx.db
    .from('delivery_zones')
    .select('id, nombre')
    .eq('restaurant_id', ctx.restaurantId);

  const porNombre = new Map(
    ((existentes ?? []) as { id: string; nombre: string }[])
      .map((z) => [z.nombre.toLowerCase(), z.id]),
  );

  const conservados = new Set<string>();
  for (const [i, z] of zones.entries()) {
    const existenteId = porNombre.get(z.nombre.toLowerCase());
    if (existenteId) {
      conservados.add(existenteId);
      await ctx.db
        .from('delivery_zones')
        .update({ nombre: z.nombre, tarifa: z.tarifa, activo: true, sort_order: i })
        .eq('id', existenteId);
    } else {
      await ctx.db.from('delivery_zones').insert({
        restaurant_id: ctx.restaurantId,
        nombre: z.nombre,
        tarifa: z.tarifa,
        sort_order: i,
      });
    }
  }

  const aDesactivar = ((existentes ?? []) as { id: string }[])
    .map((z) => z.id)
    .filter((id) => !conservados.has(id));

  if (aDesactivar.length > 0) {
    await ctx.db.from('delivery_zones').update({ activo: false }).in('id', aDesactivar);
  }

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  updateTag(`restaurant:${ctx.restaurantId}`);
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

  updateTag(`restaurant:${ctx.restaurantId}`);
  if (ctx.isSuperAdmin) {
    revalidatePath(`/super/restaurantes/${ctx.restaurantId}`, 'layout');
    redirect(`/super/restaurantes/${ctx.restaurantId}/informacion?saved=location`);
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

  const parsedExceptions = parseHourExceptions(formData.get('hour_exceptions') as string | null);
  if ('error' in parsedExceptions) return { error: parsedExceptions.error };

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
      hour_exceptions: parsedExceptions.exceptions,
      timezone,
      orders_paused: formData.get('orders_paused') === 'true',
      pause_message: (formData.get('pause_message') as string)?.trim() || null,
    })
    .eq('id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidatePath('/admin/perfil');
  revalidatePath('/');
  updateTag(`restaurant:${ctx.restaurantId}`);
  redirect('/admin/perfil?saved=1');
}

/** Idiomas de menú soportados hoy además del español (siempre disponible). */
const SUPPORTED_MENU_LANGUAGES = ['en'];

/**
 * Activa/desactiva el selector de idioma del menú público (Fase 3 auditoría
 * de lanzamiento). El dueño no tiene que traducir todo su catálogo primero:
 * los productos/categorías sin traducción muestran el español (fallback,
 * ver lib/locale) — esto solo prende o apaga el switch ES/EN que ve el
 * comensal.
 */
export async function updateMenuLanguages(formData: FormData): Promise<void> {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const requested = (formData.get('menu_languages') as string | null)
    ?.split(',').map((l) => l.trim()).filter(Boolean) ?? [];
  const menu_languages = SUPPORTED_MENU_LANGUAGES.filter((l) => requested.includes(l));

  await ctx.db
    .from('restaurants')
    .update({ menu_languages })
    .eq('id', ctx.restaurantId);

  revalidatePath('/admin/ajustes/restaurante');
  revalidatePath('/');
  updateTag(`restaurant:${ctx.restaurantId}`);
}

export type SaveThemeResult = { error?: string; ok?: boolean };

export async function saveOrdersAndCurrency(input: {
  restaurantId: string;
  patch: Pick<ThemeConfig,
    'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
    'tipEnabled' | 'tipPercent' | 'acceptsCard' |
    'currencySymbol' | 'currencyPosition' | 'locale' | 'animations'
  > & Partial<Pick<ThemeConfig, 'floorPlan' | 'kdsYellowMin' | 'kdsRedMin' | 'kdsConfirmFirst' | 'autoConfirmEnabled' | 'autoConfirmMinutes' | 'tipOrderTypes'>>;
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
  const allowed = isSuperAdmin
    || (await canActOnRestaurant(profile.restaurant_id, input.restaurantId))
    || (await canActOnGroupBranch(input.restaurantId));
  if (!allowed) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();

  // Mismo tope que updateOwnOrderTypes: esta acción también puede escribir
  // orderTypes (p.ej. el toggle "Comer en local" de /admin/mesas), así que
  // ESTANDAR no puede colarse a los 3 modos por esta vía tampoco.
  if (!isSuperAdmin) {
    const { data: rest } = await db
      .from('restaurants')
      .select('plan_actual')
      .eq('id', input.restaurantId)
      .single();
    if (rest?.plan_actual === 'ESTANDAR' && input.patch.orderTypes.length > ESTANDAR_MAX_ORDER_TYPES) {
      return { error: `El plan Estándar permite hasta ${ESTANDAR_MAX_ORDER_TYPES} modos de pedido a la vez. Para activar los 3, actualiza a Premium.` };
    }
  }

  const { data: row } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', input.restaurantId)
    .maybeSingle();

  const existingConfig = (row?.config as Record<string, unknown>) ?? {};
  const previousOrderTypes = (existingConfig.orderTypes as OrderType[] | undefined) ?? input.patch.orderTypes;
  const newConfig = { ...existingConfig, ...input.patch };

  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: input.restaurantId, config: newConfig }, { onConflict: 'restaurant_id' });

  if (error) return { error: error.message };

  // Bitácora legible (activity_log) — el registro que sostiene el cobro
  // (restaurant_channel_log) lo escribe un trigger en restaurant_themes,
  // no esta llamada (ver channel-history.ts).
  await logChannelChanges(input.restaurantId, previousOrderTypes, input.patch.orderTypes, user.id);

  revalidatePath('/admin/perfil');
  revalidatePath('/admin/personalizacion');
  revalidatePath('/admin/mesas');
  revalidatePath('/admin/mesero');
  revalidatePath('/');
  updateTag(`restaurant:${input.restaurantId}`);
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
  const allowed = isSuperAdmin
    || (await canActOnRestaurant(profile.restaurant_id, restaurantId))
    || (await canActOnGroupBranch(restaurantId));
  if (!allowed) {
    return { error: 'No autorizado para este restaurante.' };
  }
  // Mínimo un tipo de pedido activo
  if (orderTypes.length === 0) return { error: 'Debe haber al menos un modo de pedido activo.' };

  const db = createServiceClient();

  // BASICO no tiene pedidos en línea (hasOrders=false): sus canales los fija
  // Leogin y solo el super admin los cambia. ESTANDAR sí administra sus
  // propios canales, pero tope de ESTANDAR_MAX_ORDER_TYPES (2 de 3) — para
  // tener los 3 a la vez hay que subir a Premium. Premium+ no tiene tope.
  if (!isSuperAdmin) {
    const { data: rest } = await db
      .from('restaurants')
      .select('plan_actual')
      .eq('id', restaurantId)
      .single();
    const plan = (rest?.plan_actual as string | null) ?? null;
    if (plan === 'BASICO') {
      return { error: 'Tu plan no permite cambiar los canales de pedido. Escríbenos para ajustar tu paquete.' };
    }
    if (plan === 'ESTANDAR' && orderTypes.length > ESTANDAR_MAX_ORDER_TYPES) {
      return { error: `El plan Estándar permite hasta ${ESTANDAR_MAX_ORDER_TYPES} modos de pedido a la vez. Para activar los 3, actualiza a Premium.` };
    }
  }
  const { data: row } = await db
    .from('restaurant_themes')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const existing = (row?.config as Record<string, unknown>) ?? {};
  const previousOrderTypes = (existing.orderTypes as OrderType[] | undefined) ?? orderTypes;
  const { error } = await db
    .from('restaurant_themes')
    .upsert({ restaurant_id: restaurantId, config: { ...existing, orderTypes } }, { onConflict: 'restaurant_id' });
  if (error) return { error: error.message };

  // Bitácora legible (activity_log) — el registro que sostiene el cobro
  // (restaurant_channel_log) lo escribe un trigger en restaurant_themes,
  // no esta llamada (ver channel-history.ts).
  await logChannelChanges(restaurantId, previousOrderTypes, orderTypes, user.id);

  // "Plan a tu medida": al cambiar canales, recalcula la mensualidad de los
  // restaurantes en modo automático (la función solo toca filas auto_price=true).
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  revalidatePath('/admin/modulos');
  revalidatePath('/admin/personalizacion');
  revalidatePath('/admin/mesas');
  revalidatePath('/admin/suscripcion');
  revalidatePath('/');
  updateTag(`restaurant:${restaurantId}`);
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
  if (!isSuperAdmin && !(await canActOnRestaurant(profile.restaurant_id, restaurantId))) {
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
  /** true cuando el dueño aplicó una plantilla: el CSS a medida existente se
      ELIMINA (se inyecta al final del documento y pisaría los colores de la
      plantilla → mezcla ilegible). Es solo un borrado — el dueño sigue sin
      poder escribir CSS propio. */
  resetCustomCss?: boolean;
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
  if (!isSuperAdmin && !(await canActOnRestaurant(profile.restaurant_id, input.restaurantId))) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const { restaurantId, config, content, customCss } = input;

  // custom_css es CSS crudo (superficie de inyección): solo el Super Admin
  // puede definirlo (modelo "Leonardo diseña"). Para un dueño NO se toca —
  // se conserva el valor existente, ignorando lo que mande el cliente (la UI
  // ya le oculta el campo, pero el server action es el candado real).
  // EXCEPCIÓN segura: si aplicó una plantilla (resetCustomCss), el CSS se
  // BORRA — borrar no es inyección, y sin esto el CSS del look anterior
  // pisaba las variables de la plantilla recién elegida.
  let effectiveCss: string | null;
  if (isSuperAdmin) {
    effectiveCss = customCss?.trim() ? customCss : null;
  } else if (input.resetCustomCss === true) {
    effectiveCss = null;
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
  updateTag(`restaurant:${restaurantId}`);
  return { ok: true };
}

/* ============================================================
   PLANTILLAS PROPIAS DEL RESTAURANTE
   ------------------------------------------------------------
   Cada restaurante puede guardar su propio diseño (mismo subconjunto
   visual que una plantilla builtin — ver TEMPLATE_VISUAL_KEYS) como
   plantilla reutilizable, hasta un máximo. A diferencia de
   theme_templates (biblioteca GLOBAL, solo Super Admin), estas viven
   en restaurant_theme_templates, una fila por diseño guardado,
   scoped por restaurant_id.
   ============================================================ */

export interface RestaurantThemeTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  config: TemplateConfig;
  created_at: string;
}

const MAX_RESTAURANT_TEMPLATES = 5;

/** Verifica sesión + pertenencia al restaurante; null si no autorizado. */
async function resolveOwnerThemeContext(restaurantId: string) {
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
  if (!isSuperAdmin && !(await canActOnRestaurant(profile.restaurant_id, restaurantId))) return null;

  return createServiceClient();
}

export async function listRestaurantThemeTemplates(restaurantId: string): Promise<RestaurantThemeTemplate[]> {
  const db = await resolveOwnerThemeContext(restaurantId);
  if (!db) return [];
  const { data } = await db
    .from('restaurant_theme_templates')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as RestaurantThemeTemplate[];
}

export async function saveRestaurantThemeTemplate(input: {
  restaurantId: string;
  name: string;
  config: ThemeConfig;
}): Promise<{ error?: string; template?: RestaurantThemeTemplate }> {
  const db = await resolveOwnerThemeContext(input.restaurantId);
  if (!db) return { error: 'No autorizado.' };

  const name = input.name.trim();
  if (!name) return { error: 'Ponle un nombre a la plantilla.' };
  if (name.length > 60) return { error: 'Nombre demasiado largo (máx. 60 caracteres).' };

  const { count } = await db
    .from('restaurant_theme_templates')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', input.restaurantId);
  if ((count ?? 0) >= MAX_RESTAURANT_TEMPLATES) {
    return { error: `Ya tienes ${MAX_RESTAURANT_TEMPLATES} plantillas guardadas (el máximo). Elimina una para guardar otra.` };
  }

  const { data, error } = await db
    .from('restaurant_theme_templates')
    .insert({
      restaurant_id: input.restaurantId,
      name,
      config: extractVisualConfig(input.config),
    })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath('/admin/personalizacion');
  return { template: data as RestaurantThemeTemplate };
}

export async function deleteRestaurantThemeTemplate(input: {
  restaurantId: string;
  id: string;
}): Promise<{ error?: string }> {
  const db = await resolveOwnerThemeContext(input.restaurantId);
  if (!db) return { error: 'No autorizado.' };

  const { error } = await db
    .from('restaurant_theme_templates')
    .delete()
    .eq('id', input.id)
    .eq('restaurant_id', input.restaurantId); // candado extra: no borrar plantillas de otro restaurante aunque adivinen el id

  if (error) return { error: error.message };
  revalidatePath('/admin/personalizacion');
  return {};
}
