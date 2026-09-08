'use server';

/* Configurar las estaciones de impresión (migración 130, M-07).
   ------------------------------------------------------------
   Una ESTACIÓN es dónde se hace la comida —Cocina, Barra, Parrilla—: un
   nombre y una impresora. Las categorías apuntan a una, y un producto
   suelto puede apuntar a otra.

   Todo lo que se guarda aquí lo lee `lib/db/print-stations.ts` al
   imprimir. Este archivo solo escribe, y con dos cuidados constantes:

    1. **El espejo.** El destino de la estación por defecto se copia a
       `print_agents.kitchen_target` en cada cambio. Esa columna la leen
       ocho sitios y es la única que conoce un agente sin actualizar (y el
       hub, que imprime sin conexión contra su copia cacheada). Vive como
       espejo, con un solo escritor: `espejarDestino`.

    2. **La migración llega tarde.** Donde la 130 no ha corrido, la
       pantalla entera se apaga en vez de reventar. */

import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueuePrintJob, ticketFormatFor } from '@/lib/print-agent';
import { buildTestKitchenEscPos } from '@/lib/escpos';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { destinoValido } from '@/lib/print-routing';
import {
  getPrintStations, hayEstaciones, type PrintStation,
} from '@/lib/db/print-stations';

/** Mismo criterio que las acciones del agente: dueño o encargado, nunca staff. */
async function acceso(): Promise<{ restaurantId: string } | { error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar las impresoras.' };
  }
  let restaurantId = (ctx.restaurant?.id as string | undefined) ?? null;
  if (!restaurantId && ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  }
  if (!restaurantId) return { error: 'No autorizado.' };
  return { restaurantId };
}

/**
 * Copia el destino de la estación por defecto a `print_agents.kitchen_target`.
 *
 * No es duplicar por duplicar: esa columna es la que ve un agente que
 * todavía no sabe de estaciones, la que cachea el hub para imprimir sin
 * internet, y la que consultan media docena de pantallas para saber si
 * este local puede imprimir. Mientras exista, tiene que decir la verdad.
 * Best-effort: que falle el espejo no puede impedir guardar la estación.
 */
async function espejarDestino(restaurantId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('print_stations')
      .select('target')
      .eq('restaurant_id', restaurantId)
      .eq('is_default', true)
      .maybeSingle();
    if (!data) return;
    await db.from('print_agents')
      .update({ kitchen_target: (data.target as string | null) ?? null })
      .eq('restaurant_id', restaurantId);
  } catch {
    /* el espejo es una comodidad, no la fuente */
  }
}

// ── Leer ──────────────────────────────────────────────────────

export interface CategoriaConEstacion {
  id: string;
  name: string;
  /** `null` = la de por defecto. */
  stationId: string | null;
  /** Cuántos productos suyos tienen anulación propia (M-07). */
  productosConAnulacion: number;
}

export interface StationsConfig {
  /** `false` = la migración 130 no ha corrido aquí: la pantalla se apaga. */
  disponible: boolean;
  stations: PrintStation[];
  categorias: CategoriaConEstacion[];
}

export async function getStationsConfig(): Promise<StationsConfig> {
  const apagado: StationsConfig = { disponible: false, stations: [], categorias: [] };
  const a = await acceso();
  if ('error' in a) return apagado;
  if (!(await hayEstaciones())) return apagado;

  const db = createServiceClient();
  const [stations, { data: cats }, { data: prods }] = await Promise.all([
    getPrintStations(a.restaurantId),
    db.from('categories').select('id, name, station_id')
      .eq('restaurant_id', a.restaurantId).eq('is_active', true).order('sort_order'),
    db.from('products').select('category_id')
      .eq('restaurant_id', a.restaurantId).not('station_id', 'is', null),
  ]);

  const anulaciones = new Map<string, number>();
  for (const p of prods ?? []) {
    const cid = (p.category_id as string | null) ?? '';
    anulaciones.set(cid, (anulaciones.get(cid) ?? 0) + 1);
  }

  return {
    disponible: true,
    stations,
    categorias: (cats ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      stationId: (c.station_id as string | null) ?? null,
      productosConAnulacion: anulaciones.get(c.id as string) ?? 0,
    })),
  };
}

// ── Escribir ──────────────────────────────────────────────────

type Res = { error?: string; ok?: boolean };

const DESTINO_MALO =
  'Ese destino de impresora no se entiende. Elige una de la lista, o escribe ' +
  'algo como «tcp://192.168.1.50:9100».';

/** `null`/vacío = estación sin impresora todavía, que sí es un estado válido. */
function destinoAceptable(target: string | null | undefined): boolean {
  const v = target?.trim();
  return !v || destinoValido(v);
}

/** Traduce los fallos de la base a algo que un dueño pueda entender. */
function mensaje(error: { code?: string | null; message?: string | null } | null): string {
  if (faltaLaTabla(error)) return 'Falta aplicar una actualización de la base de datos.';
  if (error?.code === '23505') {
    return error.message?.includes('nombre_unico')
      ? 'Ya tienes una estación con ese nombre.'
      : 'Ya hay otra estación principal.';
  }
  if (error?.code === '23514') return 'El nombre debe tener entre 1 y 40 letras.';
  return error?.message ?? 'No se pudo guardar.';
}

export async function crearEstacion(input: { name: string; target: string | null }): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  if (!destinoAceptable(input.target)) return { error: DESTINO_MALO };

  const db = createServiceClient();
  // Al final de la lista: el orden de los papeles es el orden de esta
  // columna, y una estación nueva no tiene por qué colarse la primera.
  const actuales = await getPrintStations(a.restaurantId);
  const { error } = await db.from('print_stations').insert({
    restaurant_id: a.restaurantId,
    name: input.name.trim(),
    target: input.target?.trim() || null,
    sort_order: actuales.length,
    // La primera estación de un local es la de por defecto por obligación:
    // sin ninguna marcada, todo lo que nadie mapeó no tendría dónde caer.
    is_default: actuales.length === 0,
  });
  if (error) return { error: mensaje(error) };
  await espejarDestino(a.restaurantId);
  return { ok: true };
}

export async function actualizarEstacion(
  id: string,
  input: { name?: string; target?: string | null },
): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  if (input.target !== undefined && !destinoAceptable(input.target)) {
    return { error: DESTINO_MALO };
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.target !== undefined) patch.target = input.target?.trim() || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = createServiceClient();
  const { error } = await db.from('print_stations').update(patch)
    .eq('id', id).eq('restaurant_id', a.restaurantId);
  if (error) return { error: mensaje(error) };
  await espejarDestino(a.restaurantId);
  return { ok: true };
}

/**
 * Cambia cuál es la estación principal.
 *
 * En DOS pasos a propósito. El índice único parcial de la migración 130
 * comprueba fila a fila, así que un solo `update` que apague una y encienda
 * otra puede chocar consigo mismo según el orden en que Postgres toque las
 * filas. Entre los dos pasos hay un instante sin ninguna principal, y eso
 * está previsto: `repartirPorEstacion` cae en la primera por orden y nadie
 * pierde un plato.
 */
export async function hacerPrincipal(id: string): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  const db = createServiceClient();
  const apagar = await db.from('print_stations').update({ is_default: false })
    .eq('restaurant_id', a.restaurantId).eq('is_default', true);
  if (apagar.error) return { error: mensaje(apagar.error) };

  const { error } = await db.from('print_stations').update({ is_default: true })
    .eq('id', id).eq('restaurant_id', a.restaurantId);
  if (error) return { error: mensaje(error) };
  await espejarDestino(a.restaurantId);
  return { ok: true };
}

/**
 * Borra una estación. Sus categorías vuelven solas a la de por defecto
 * (`on delete set null` en la migración 130), y sus productos con anulación
 * también. La principal no se puede borrar: sin ella no habría dónde caer.
 */
export async function borrarEstacion(id: string): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  const estaciones = await getPrintStations(a.restaurantId);
  const esta = estaciones.find((e) => e.id === id);
  if (!esta) return { error: 'Esa estación ya no existe.' };
  if (esta.isDefault) {
    return { error: 'La estación principal no se puede borrar: es la que recoge todo lo que no está repartido. Haz principal a otra primero.' };
  }

  const db = createServiceClient();
  const { error } = await db.from('print_stations').delete()
    .eq('id', id).eq('restaurant_id', a.restaurantId);
  if (error) return { error: mensaje(error) };
  return { ok: true };
}

/** A qué estación va una categoría. `null` = la de por defecto. */
export async function asignarCategoria(categoryId: string, stationId: string | null): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  const db = createServiceClient();
  const { error } = await db.from('categories').update({ station_id: stationId })
    .eq('id', categoryId).eq('restaurant_id', a.restaurantId);
  if (error) return { error: mensaje(error) };
  return { ok: true };
}

/**
 * Quita la anulación por producto de toda una categoría.
 *
 * Existe porque la anulación por producto es invisible desde aquí: se pone
 * una por una desde la ficha del producto, y sin una salida el dueño puede
 * quedarse mirando una categoría que dice «Barra» mientras tres de sus
 * platos se van a otro sitio sin que nada lo explique.
 */
export async function limpiarAnulaciones(categoryId: string): Promise<Res> {
  const a = await acceso();
  if ('error' in a) return a;

  const db = createServiceClient();
  const { error } = await db.from('products').update({ station_id: null })
    .eq('category_id', categoryId).eq('restaurant_id', a.restaurantId);
  if (error) return { error: mensaje(error) };
  return { ok: true };
}

/** Un ticket de prueba por la impresora de esta estación. */
export async function probarEstacion(id: string): Promise<{ error?: string; ok?: boolean }> {
  const a = await acceso();
  if ('error' in a) return a;

  const estacion = (await getPrintStations(a.restaurantId)).find((e) => e.id === id);
  if (!estacion) return { error: 'Esa estación ya no existe.' };
  if (!estacion.target) return { error: `«${estacion.name}» todavía no tiene impresora asignada.` };

  const format = await ticketFormatFor(a.restaurantId);
  const res = await enqueuePrintJob({
    restaurantId: a.restaurantId,
    role: 'kitchen',
    bytes: buildTestKitchenEscPos(format),
    targetOverride: estacion.target,
    stationId: estacion.id,
  });
  if ('error' in res) return { error: res.error };
  return { ok: true };
}
