'use server';

/* ============================================================
   ESTADOS DEL DÍA · publicar y quitar (CV-32, migración 189)
   ------------------------------------------------------------
   Mismo permiso que el catálogo («catalogo»). La foto la sube el
   panel al bucket del restaurante (carpeta `estados/`); aquí solo se
   acepta una URL de NUESTRO bucket y de ESTE restaurante. Escribe el
   servidor con la service role: la tabla no tiene políticas
   permisivas.
   ============================================================ */

import { updateTag } from 'next/cache';
import { contextoDeCatalogo } from '@/lib/catalogo/contexto';
import { createServiceClient } from '@/lib/supabase/service';
import { assetPath } from '@/lib/asset-image';
import { faltaLaMigracion } from '@/lib/db/migracion-ausente';

export type ResultadoEstado = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_TABLA = 'Los estados todavía no están activos en este restaurante (falta la migración 189).';

export async function publicarEstado(input: {
  restaurantId?: string | null;
  imagenUrl: string;
  texto?: string | null;
  platilloId?: string | null;
}): Promise<ResultadoEstado> {
  const ctx = await contextoDeCatalogo(input.restaurantId ?? null);
  if (!ctx) return { ok: false, error: 'No tienes permiso para publicar en la carta.' };

  const ruta = assetPath(input.imagenUrl);
  if (!ruta || !ruta.startsWith(`${ctx.restaurantId}/`)) return { ok: false, error: 'Sube la foto otra vez: no se reconoció.' };
  const texto = (input.texto ?? '').trim().slice(0, 80) || null;
  const platilloId = input.platilloId && UUID.test(input.platilloId) ? input.platilloId : null;

  const db = createServiceClient();
  if (platilloId) {
    const { data: p } = await db.from('products').select('id').eq('id', platilloId).eq('restaurant_id', ctx.restaurantId).maybeSingle();
    if (!p) return { ok: false, error: 'Ese platillo no es de este restaurante.' };
  }
  const { error } = await db.from('menu_estados').insert({
    restaurant_id: ctx.restaurantId,
    imagen_url: input.imagenUrl,
    texto,
    platillo_id: platilloId,
    creado_por: ctx.userId,
  });
  if (error) return { ok: false, error: faltaLaMigracion(error) ? SIN_TABLA : 'No se pudo publicar. Intenta de nuevo.' };
  updateTag(`estados:${ctx.restaurantId}`);
  return { ok: true };
}

export async function quitarEstado(input: { restaurantId?: string | null; id: string }): Promise<ResultadoEstado> {
  const ctx = await contextoDeCatalogo(input.restaurantId ?? null);
  if (!ctx) return { ok: false, error: 'No tienes permiso para cambiar la carta.' };
  if (!UUID.test(input.id)) return { ok: false, error: 'Estado no válido.' };
  const db = createServiceClient();
  const { error } = await db.from('menu_estados').delete().eq('id', input.id).eq('restaurant_id', ctx.restaurantId);
  if (error) return { ok: false, error: faltaLaMigracion(error) ? SIN_TABLA : 'No se pudo quitar. Intenta de nuevo.' };
  updateTag(`estados:${ctx.restaurantId}`);
  return { ok: true };
}
