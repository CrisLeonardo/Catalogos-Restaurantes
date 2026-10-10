'use server';

/* Acciones del archivo de ediciones de la Vitrina (migración 141).
   Mismo candado que guardar el diseño del menú: quien puede actuar sobre el
   restaurante y tiene la sección «Personalizar» (o el Super Admin). */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnRestaurant } from '@/lib/db/membership';
import { puedeEnSeccion, SIN_SECCION } from '@/lib/auth/seccion';
import { faltaLaMigracion } from '@/lib/db/migracion-ausente';
import { revalidatePath, updateTag } from 'next/cache';

export interface EdicionDelPanel {
  id: string;
  title: string;
  closesAt: string;
  soldOutAt: string | null;
  piezas: number;
  vendidas: number;
}

type Permiso = { ok: true } | { error: string };

async function autorizar(restaurantId: string): Promise<Permiso> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };
  const { data: profile } = await supabase.from('profiles').select('restaurant_id, role').eq('id', user.id).single();
  if (!profile) return { error: 'No autorizado.' };
  if (profile.role === 'SUPER_ADMIN') return { ok: true };
  if (!(await canActOnRestaurant(profile.restaurant_id, restaurantId))) return { error: 'No autorizado.' };
  if (!(await puedeEnSeccion(restaurantId, 'personalizar'))) return { error: SIN_SECCION };
  return { ok: true };
}

const SIN_MIGRACION = 'El archivo de ediciones aún no está activo (falta la migración 141).';

function refrescar(restaurantId: string) {
  updateTag(`vitrina:${restaurantId}`);
  updateTag(`menu:${restaurantId}`);
  updateTag(`restaurant:${restaurantId}`);
  revalidatePath('/');
}

/** Las ediciones archivadas, con lo vendido (solo para el panel). */
export async function listarEdiciones(restaurantId: string): Promise<{ ediciones?: EdicionDelPanel[]; error?: string }> {
  const permiso = await autorizar(restaurantId);
  if ('error' in permiso) return { error: permiso.error };
  const db = createServiceClient();
  const { data, error } = await db
    .from('drop_editions')
    .select('id, title, closes_at, sold_out_at, drop_edition_items(units_sold)')
    .eq('restaurant_id', restaurantId)
    .order('closes_at', { ascending: false })
    .limit(30);
  if (error) return faltaLaMigracion(error) ? { ediciones: [] } : { error: error.message };
  return {
    ediciones: (data ?? []).map((e) => {
      const items = (e.drop_edition_items as Array<{ units_sold: number }> | null) ?? [];
      return {
        id: e.id as string,
        title: e.title as string,
        closesAt: e.closes_at as string,
        soldOutAt: (e.sold_out_at as string | null) ?? null,
        piezas: items.length,
        vendidas: items.reduce((n, i) => n + (Number(i.units_sold) || 0), 0),
      };
    }),
  };
}

/**
 * Cierra la edición viva YA y la archiva: pone el cierre del tema en este
 * instante (así el menú y el candado de pedidos la dan por cerrada) y guarda
 * la foto de sus piezas. Devuelve la hora de cierre para que el editor la
 * refleje sin recargar.
 */
export async function cerrarYArchivarEdicion(restaurantId: string): Promise<{ closesAt?: string; error?: string }> {
  const permiso = await autorizar(restaurantId);
  if ('error' in permiso) return { error: permiso.error };
  const db = createServiceClient();

  const { data: tema } = await db.from('restaurant_themes').select('config').eq('restaurant_id', restaurantId).maybeSingle();
  const config = (tema?.config as Record<string, unknown> | null) ?? {};
  if (config.launchMode !== true) return { error: 'Primero enciende el modo lanzamiento y guarda.' };

  const ahora = new Date().toISOString();
  const { error: e1 } = await db
    .from('restaurant_themes')
    .update({ config: { ...config, launchEndsAt: ahora } })
    .eq('restaurant_id', restaurantId);
  if (e1) return { error: e1.message };

  const { error: e2 } = await db.rpc('vitrina_archivar_edicion', { p_restaurant: restaurantId, p_cierre: ahora });
  if (e2) return { error: faltaLaMigracion(e2) ? SIN_MIGRACION : e2.message };

  refrescar(restaurantId);
  return { closesAt: ahora };
}

/** Quita una edición del archivo (por si se archivó por error). */
export async function quitarEdicion(restaurantId: string, edicionId: string): Promise<{ ok?: true; error?: string }> {
  const permiso = await autorizar(restaurantId);
  if ('error' in permiso) return { error: permiso.error };
  const db = createServiceClient();
  const { error } = await db.from('drop_editions').delete().eq('id', edicionId).eq('restaurant_id', restaurantId);
  if (error) return { error: faltaLaMigracion(error) ? SIN_MIGRACION : error.message };
  refrescar(restaurantId);
  return { ok: true };
}
