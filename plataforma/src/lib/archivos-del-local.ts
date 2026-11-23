/* ============================================================
   ARCHIVOS DE UN LOCAL BORRADO
   ------------------------------------------------------------
   Auditoría de lanzamiento 2026-11-23, LZ-10. Borrar un restaurante se
   lleva sus filas en cascada, pero no sus archivos: las fotos seguían
   públicas en `restaurant-assets/<id>/…` y los comprobantes de pago
   (pueden llevar datos bancarios) en `payment-proofs/<id>/…`.

   Se llama DESPUÉS de borrar la fila del restaurante:
     · payment-proofs: se borra toda su carpeta (nadie más la usa);
     · restaurant-assets: se borra lo que ya no nombra ninguna fila.
       «Duplicar restaurante» copia la carta con las mismas URLs, y las
       plantillas y el logo de un grupo pueden apuntar a esta carpeta: esas
       rutas las devuelve `leogin_archivos_en_uso` (migración 194) y se
       conservan.

   Un fallo aquí no deshace el borrado del local: se informa y se puede
   repetir (la función no hace nada con una carpeta vacía).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET_FOTOS = 'restaurant-assets';
/** Privado, por local (migración 148). lib/db/comprobantes.ts lo reexporta. */
export const BUCKET_COMPROBANTES = 'payment-proofs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGINA = 1000;
const LOTE = 100;

export interface ResultadoArchivos {
  fotosBorradas: number;
  fotosConservadas: number;
  comprobantesBorrados: number;
  error?: string;
}

/** Todas las rutas bajo `carpeta`, bajando por las subcarpetas. */
export async function listarCarpeta(db: SupabaseClient, bucket: string, carpeta: string): Promise<string[]> {
  const rutas: string[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db.storage.from(bucket).list(carpeta, { limit: PAGINA, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    for (const item of data ?? []) {
      const ruta = `${carpeta}/${item.name}`;
      // Una subcarpeta llega sin id: se baja por ella.
      if (item.id == null) rutas.push(...(await listarCarpeta(db, bucket, ruta)));
      else rutas.push(ruta);
    }
    if ((data?.length ?? 0) < PAGINA) return rutas;
  }
}

async function quitar(db: SupabaseClient, bucket: string, rutas: string[]) {
  for (let i = 0; i < rutas.length; i += LOTE) {
    const { error } = await db.storage.from(bucket).remove(rutas.slice(i, i + LOTE));
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
}

export async function borrarArchivosDelLocal(db: SupabaseClient, restaurantId: string): Promise<ResultadoArchivos> {
  const resultado: ResultadoArchivos = { fotosBorradas: 0, fotosConservadas: 0, comprobantesBorrados: 0 };
  // Sin un id válido, la «carpeta» sería la raíz del bucket: no se toca nada.
  if (!UUID.test(restaurantId)) return { ...resultado, error: 'id de restaurante inválido' };

  try {
    const comprobantes = await listarCarpeta(db, BUCKET_COMPROBANTES, restaurantId);
    await quitar(db, BUCKET_COMPROBANTES, comprobantes);
    resultado.comprobantesBorrados = comprobantes.length;

    const fotos = await listarCarpeta(db, BUCKET_FOTOS, restaurantId);
    if (fotos.length) {
      const { data, error } = await db.rpc('leogin_archivos_en_uso', { p_restaurant_id: restaurantId });
      if (error) throw new Error(`archivos en uso: ${error.message}`);
      // `setof text` llega como lista de textos o de { leogin_archivos_en_uso }.
      const enUso = new Set(((data as unknown[] | null) ?? []).map((f) =>
        typeof f === 'string' ? f : String((f as Record<string, unknown>).leogin_archivos_en_uso)));
      const sobran = fotos.filter((r) => !enUso.has(r));
      await quitar(db, BUCKET_FOTOS, sobran);
      resultado.fotosBorradas = sobran.length;
      resultado.fotosConservadas = fotos.length - sobran.length;
    }
  } catch (e) {
    resultado.error = e instanceof Error ? e.message : String(e);
  }
  return resultado;
}
