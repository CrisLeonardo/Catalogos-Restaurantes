'use server';

import { createClient, getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { puedeEnSeccion } from '@/lib/auth/seccion';
import { revalidatePath, updateTag } from 'next/cache';
import type { DayKey, WeeklyHours } from '@/lib/hours';

async function resolveContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // El super admin y quien administra un grupo trabajan sobre una sucursal que no es su
  // restaurant_id: el primero por el id del form, el segundo por el subdominio
  // verificado contra su organización (resolveGroupBranchId).
  // Quien administra un grupo entra a la sucursal del subdominio (verificada
  // contra su organización); el resto, al suyo. `resolveGroupBranchId`
  // devuelve null si no administra ninguno, así que sirve de las dos cosas:
  // de comprobación y de id. Ver la migración 116.
  const groupBranchId = profile.role === 'SUPER_ADMIN' ? null : await resolveGroupBranchId();
  const elevated = profile.role === 'SUPER_ADMIN' || groupBranchId !== null;
  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (formData.get('restaurantId') as string)
    : (groupBranchId ?? (await resolveOwnRestaurantId(profile.restaurant_id)));

  if (!restaurantId) return null;
  if (!(await puedeEnSeccion(restaurantId, 'categorias'))) return null;

  const db = elevated ? createServiceClient() : supabase;
  return { db, restaurantId, role: profile.role, userId: user.id };
}

function revalidateAll(restaurantId: string) {
  revalidatePath('/admin/menu');
  revalidatePath('/admin/categorias');
  updateTag(`menu:${restaurantId}`);
}

/** "HH:MM" 24h válido (00:00–23:59). */
function isHHMM(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/**
 * Valida y normaliza el horario de disponibilidad de la categoría (mismo
 * formato que restaurants.hours). Devuelve null si viene vacío o inválido
 * (null = disponible siempre). Defensa server-side: no se confía en el cliente.
 */
function parseAvailability(raw: string | null): WeeklyHours | null {
  if (!raw?.trim()) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const out: WeeklyHours = {};
  for (const day of ['0', '1', '2', '3', '4', '5', '6'] as DayKey[]) {
    const list = (data as Record<string, unknown>)[day];
    if (!Array.isArray(list)) continue;
    const valid = list
      .slice(0, 6) // máx 6 turnos por día
      .filter((iv): iv is [string, string] =>
        Array.isArray(iv) && iv.length === 2 && isHHMM(iv[0]) && isHHMM(iv[1]))
      .map(([o, c]) => [o.trim(), c.trim()] as [string, string]);
    if (valid.length > 0) out[day] = valid;
  }
  return Object.keys(out).length > 0 ? out : null;
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

  revalidateAll(ctx.restaurantId);
}

/* Subir/bajar una categoría (migración 156, auditoría 2026-11-03 X12).
   Antes eran dos UPDATE sueltos con la posición que mandaba el navegador
   y sin filtrar el segundo por restaurante: con dos categorías en la misma
   posición «subir» no encontraba vecina. La función bloquea, renumera sin
   huecos ni repetidos y cambia de lugar, todo junto. Ya no hace falta el
   `sort_order` del formulario. */
async function moverCategoria(formData: FormData, direccion: -1 | 1) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return;

  const { error } = await createServiceClient().rpc('leogin_mover_categoria', {
    p_restaurant_id: ctx.restaurantId,
    p_category_id: id,
    p_direccion: direccion,
  });
  if (error) console.error('[moverCategoria]', error.code ?? '', error.message ?? '');

  revalidateAll(ctx.restaurantId);
}

export async function moveCategoryUp(formData: FormData) {
  await moverCategoria(formData, -1);
}

export async function moveCategoryDown(formData: FormData) {
  await moverCategoria(formData, 1);
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
    name_en: (formData.get('name_en') as string)?.trim() || null,
    icon: (formData.get('icon') as string) || null,
    availability: parseAvailability(formData.get('availability') as string | null),
    sort_order,
  });

  if (error) return { error: error.message };

  revalidateAll(ctx.restaurantId);
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
    .update({
      name,
      name_en: (formData.get('name_en') as string)?.trim() || null,
      icon: (formData.get('icon') as string) || null,
      availability: parseAvailability(formData.get('availability') as string | null),
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  revalidateAll(ctx.restaurantId);
  return { success: true };
}

/**
 * Borrar una categoría (auditoría 1.9, R09.4). Si tiene platillos hay que
 * decir a dónde pasan: antes quedaban «sin categoría» y en las cartas por
 * secciones o acordeón desaparecían del menú. Lo decide
 * `leogin_borrar_categoria` (migración 179), que también deja la bitácora.
 */
export async function deleteCategoryModal(formData: FormData): Promise<{ error?: string; ok?: true; movidos?: number }> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const destino = (formData.get('destino') as string) || null;
  const { data, error } = await createServiceClient().rpc('leogin_borrar_categoria', {
    p_restaurant: ctx.restaurantId, p_categoria: id, p_destino: destino, p_actor: ctx.userId,
  });
  if (error) return { error: error.code === 'LGD01' ? error.message : 'No se pudo borrar la categoría.' };

  revalidateAll(ctx.restaurantId);
  return { ok: true, movidos: (data as { movidos?: number })?.movidos ?? 0 };
}

/** «+ Nueva categoría» desde la ficha del platillo (E10): crea y devuelve su id. */
export async function crearCategoriaEnLinea(restaurantIdForm: string, nombre: string): Promise<{ id?: string; name?: string; error?: string }> {
  const fd = new FormData();
  fd.set('restaurantId', restaurantIdForm);
  const ctx = await resolveContext(fd);
  if (!ctx) return { error: 'No tienes permiso para crear categorías.' };
  const name = nombre.trim().slice(0, 60);
  if (!name) return { error: 'Escribe el nombre de la categoría.' };
  const { data: existing } = await ctx.db.from('categories').select('sort_order')
    .eq('restaurant_id', ctx.restaurantId).order('sort_order', { ascending: false }).limit(1);
  const { data, error } = await ctx.db.from('categories').insert({
    restaurant_id: ctx.restaurantId, name, sort_order: (existing?.[0]?.sort_order ?? -1) + 1,
  }).select('id, name').single();
  if (error || !data) return { error: 'No se pudo crear la categoría.' };
  revalidateAll(ctx.restaurantId);
  return { id: data.id as string, name: data.name as string };
}
