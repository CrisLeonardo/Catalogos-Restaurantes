'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { contextoDeCatalogo, topeDeProductos } from '@/lib/catalogo/contexto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  MAX_FILAS, leerCsv, leerHoja, normalizar, revisar, type FilaImportada,
} from '@/lib/importar-carta';
import { celdasDeXlsx } from '@/lib/importar-carta-xlsx';

/* ============================================================
   IMPORTAR UNA CARTA (ficha 2.4) — acciones del servidor
   ------------------------------------------------------------
   El cliente lee la lista o la hoja y muestra la revisión; aquí se
   vuelve a comparar contra la base (nunca se confía en lo que el
   navegador cree que existe), se publica el lote y se anota en la
   bitácora todo lo necesario para deshacerlo.
   ============================================================ */

const LIMITE_ARCHIVO = 2 * 1024 * 1024;

/** Lee una hoja .xlsx o .csv subida. Devuelve las filas sin publicar nada. */
export async function leerHojaDeCalculo(formData: FormData): Promise<{ filas: FilaImportada[] } | { error: string }> {
  const ctx = await contextoDeCatalogo((formData.get('restaurantId') as string | null) ?? null);
  if (!ctx) return { error: 'No autorizado.' };
  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige un archivo .xlsx o .csv.' };
  if (archivo.size > LIMITE_ARCHIVO) return { error: 'El archivo pasa de 2 MB. Divide la carta en dos hojas.' };

  const nombre = archivo.name.toLowerCase();
  try {
    if (nombre.endsWith('.csv')) return leerHoja(leerCsv(await archivo.text()));
    if (!nombre.endsWith('.xlsx')) return { error: 'Solo se leen archivos .xlsx o .csv. En Excel: Archivo › Guardar como › Libro de Excel.' };
    const celdas = await celdasDeXlsx(await archivo.arrayBuffer());
    if (!celdas) return { error: 'El archivo no tiene hojas.' };
    return leerHoja(celdas);
  } catch {
    return { error: 'No pudimos leer ese archivo. Revisa que sea una hoja de Excel o un CSV.' };
  }
}

export type ResultadoImportacion =
  | { ok: true; lote: string; nuevos: number; precios: number }
  | { error: string };

/** Publica las filas confirmadas: crea lo nuevo y cambia los precios. */
export async function importarCarta(input: {
  restaurantId?: string | null;
  filas: { categoria: string | null; nombre: string; precio: number; descripcion: string | null }[];
}): Promise<ResultadoImportacion> {
  const ctx = await contextoDeCatalogo(input.restaurantId ?? null);
  if (!ctx) return { error: 'No autorizado.' };
  if (!Array.isArray(input.filas) || input.filas.length === 0) return { error: 'No marcaste nada para agregar.' };
  if (input.filas.length > MAX_FILAS) return { error: `Se importan hasta ${MAX_FILAS} platillos a la vez.` };

  const db = createServiceClient();
  const [prods, cats] = await Promise.all([
    db.from('products').select('id, name, price, sort_order').eq('restaurant_id', ctx.restaurantId),
    db.from('categories').select('id, name, sort_order').eq('restaurant_id', ctx.restaurantId),
  ]);
  if (prods.error || cats.error) return { error: 'No pudimos leer tu carta. Inténtalo de nuevo.' };

  /* Se vuelve a revisar contra la base y solo pasa lo válido: el navegador
     pudo quedarse con una carta vieja. */
  const filas: FilaImportada[] = input.filas.map((f, i) => {
    const precio = Math.round(Number(f.precio) * 100) / 100;
    return {
      linea: i + 1,
      categoria: typeof f.categoria === 'string' ? f.categoria.trim().slice(0, 60) || null : null,
      nombre: String(f.nombre ?? '').trim().slice(0, 120),
      precio: Number.isFinite(precio) && precio > 0 && precio < 100000 ? precio : null,
      descripcion: typeof f.descripcion === 'string' ? f.descripcion.trim().slice(0, 500) || null : null,
      duda: null,
    };
  }).filter((f) => f.nombre.length >= 2 && f.precio !== null);
  const revisadas = revisar(filas, (prods.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, price: Number(p.price) })));
  const nuevos = revisadas.filter((f) => f.accion === 'nuevo');
  const cambios = revisadas.filter((f) => f.accion === 'cambia-precio' && f.existente);
  if (nuevos.length === 0 && cambios.length === 0) return { error: 'Todo lo marcado ya está igual en tu carta.' };

  const tope = nuevos.length > 0 ? await topeDeProductos(ctx, nuevos.length) : null;
  if (tope) return { error: tope };

  // ── Categorías: se usan las que existen; las nuevas se crean ──
  const porNombre = new Map((cats.data ?? []).map((c) => [normalizar(c.name as string), c.id as string]));
  let ordenCat = Math.max(-1, ...(cats.data ?? []).map((c) => Number(c.sort_order) || 0));
  const categoriasCreadas: string[] = [];
  const nombresNuevos = [...new Set(nuevos.map((f) => f.categoria?.trim() || 'Platillos'))];
  for (const nombre of nombresNuevos) {
    if (porNombre.has(normalizar(nombre))) continue;
    const { data, error } = await db.from('categories')
      .insert({ restaurant_id: ctx.restaurantId, name: nombre, sort_order: ++ordenCat })
      .select('id').single();
    if (error || !data) return { error: `No se pudo crear la categoría «${nombre}».` };
    porNombre.set(normalizar(nombre), data.id as string);
    categoriasCreadas.push(data.id as string);
  }

  // ── Platillos nuevos, visibles: ya pasaron por la revisión ──
  let orden = Math.max(-1, ...(prods.data ?? []).map((p) => Number(p.sort_order) || 0));
  let creados: string[] = [];
  if (nuevos.length > 0) {
    const { data, error } = await db.from('products').insert(nuevos.map((f) => ({
      restaurant_id: ctx.restaurantId,
      category_id: porNombre.get(normalizar(f.categoria?.trim() || 'Platillos')) ?? null,
      name: f.nombre,
      description: f.descripcion,
      price: f.precio,
      is_active: true,
      is_available: true,
      sort_order: ++orden,
    }))).select('id');
    if (error) {
      if (categoriasCreadas.length) await db.from('categories').delete().in('id', categoriasCreadas);
      return { error: 'No se pudieron agregar los platillos. No se cambió nada.' };
    }
    creados = (data ?? []).map((d) => d.id as string);
  }

  // ── Precios que cambian ──
  const precios: { id: string; antes: number; despues: number }[] = [];
  for (const f of cambios) {
    const { error } = await db.from('products').update({ price: f.precio })
      .eq('id', f.existente!.id).eq('restaurant_id', ctx.restaurantId);
    if (!error) precios.push({ id: f.existente!.id, antes: f.existente!.precio, despues: f.precio! });
  }

  // ── El lote, en la bitácora: es lo que permite deshacerlo ──
  const lote = crypto.randomUUID();
  await db.from('activity_log').insert({
    restaurant_id: ctx.restaurantId, actor_id: ctx.userId, action: 'importar_carta', entity: lote,
    meta: { creados, precios, categorias: categoriasCreadas },
  });

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  return { ok: true, lote, nuevos: creados.length, precios: precios.length };
}

/**
 * Deshace un lote importado: borra los platillos que todavía no se han
 * vendido, devuelve los precios que nadie volvió a cambiar y quita las
 * categorías que quedaron vacías. Lo vendido se conserva y se dice.
 */
export async function deshacerImportacion(input: { restaurantId?: string | null; lote: string }):
  Promise<{ ok: true; borrados: number; conservados: number } | { error: string }> {
  const ctx = await contextoDeCatalogo(input.restaurantId ?? null);
  if (!ctx) return { error: 'No autorizado.' };
  if (!/^[0-9a-f-]{36}$/i.test(input.lote)) return { error: 'Importación no encontrada.' };

  const db = createServiceClient();
  const { data: filas } = await db.from('activity_log').select('action, meta')
    .eq('restaurant_id', ctx.restaurantId).eq('entity', input.lote)
    .in('action', ['importar_carta', 'importar_carta_deshecha']);
  const registro = (filas ?? []).find((f) => f.action === 'importar_carta');
  if (!registro) return { error: 'Importación no encontrada.' };
  if ((filas ?? []).some((f) => f.action === 'importar_carta_deshecha')) return { error: 'Esta importación ya se deshizo.' };

  const meta = registro.meta as { creados?: string[]; precios?: { id: string; antes: number; despues: number }[]; categorias?: string[] };
  const creados = meta.creados ?? [];

  // Lo que ya se vendió no se borra: el pedido lo necesita.
  const vendidos = new Set<string>();
  if (creados.length) {
    const { data: lineas } = await db.from('order_items').select('product_id').in('product_id', creados);
    for (const l of lineas ?? []) if (l.product_id) vendidos.add(l.product_id as string);
  }
  const borrar = creados.filter((id) => !vendidos.has(id));
  if (borrar.length) {
    const { error } = await db.from('products').delete().in('id', borrar).eq('restaurant_id', ctx.restaurantId);
    if (error) return { error: 'No se pudo deshacer. Inténtalo de nuevo.' };
  }
  for (const p of meta.precios ?? []) {
    await db.from('products').update({ price: p.antes })
      .eq('id', p.id).eq('restaurant_id', ctx.restaurantId).eq('price', p.despues);
  }
  for (const id of meta.categorias ?? []) {
    const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if ((count ?? 0) === 0) await db.from('categories').delete().eq('id', id).eq('restaurant_id', ctx.restaurantId);
  }

  await db.from('activity_log').insert({
    restaurant_id: ctx.restaurantId, actor_id: ctx.userId, action: 'importar_carta_deshecha', entity: input.lote,
    meta: { borrados: borrar.length, conservados: vendidos.size },
  });
  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  return { ok: true, borrados: borrar.length, conservados: vendidos.size };
}
