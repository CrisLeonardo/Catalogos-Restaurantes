/* ============================================================
   BORRAR UN LOCAL SIN PERDER LO QUE LEOGIN LE COBRÓ
   ------------------------------------------------------------
   Auditoría de lanzamiento 2026-11-23, LZ-08 y LZ-10. Borrar un
   restaurante se lleva en cascada sus `invoices`: las mensualidades,
   implementaciones y prorrateos que Leogin le cobró, pagados o no. Son
   la contabilidad de Leogin, no del local, y desaparecían sin rastro;
   Finanzas dejaba de contarlos.

   Ahora, ANTES de borrar, se copian a la bitácora en su propia entrada
   («restaurante.cobros-guardados»). La bitácora no tiene clave foránea
   al local, así que la cascada no la toca, y es de solo escritura
   (migración 132: ni UPDATE ni DELETE), así que tampoco se pueden
   perder después. Si hay cobros y no se pueden guardar, NO se borra.
   Si el borrado falla luego, la entrada sigue siendo cierta: se
   guardaron.

   Las facturas FEL del local son suyas, no de Leogin: esas se las lleva
   el dueño con «Exportar tus datos» antes de pedir el borrado.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { borrarArchivosDelLocal, type ResultadoArchivos } from '@/lib/archivos-del-local';
import { todasLasFilas } from '@/lib/db/todas-las-filas';

/** Todas las columnas de `invoices` menos `restaurant_id` (va en la fila). */
export const COLUMNAS_COBRO =
  'id, concept, description, period, amount, currency, status, due_date, paid_at, paid_amount, payment_method, notes, created_at';

export interface QuienBorra {
  actorId: string;
  actorEmail: string | null;
  ip: string;
}

export interface LocalBorrado {
  nombre: string | null;
  slug: string | null;
  cobrosGuardados: number;
  archivos: ResultadoArchivos;
}

export async function borrarLocal(db: SupabaseClient, quien: QuienBorra, id: string): Promise<LocalBorrado> {
  // El nombre se guarda ANTES de borrar: después ya no existe, y una fila
  // que dijera solo «se borró el restaurante 3f2a…» no explica nada.
  const { data: previo } = await db.from('restaurants').select('name, slug').eq('id', id).maybeSingle();
  const nombre = (previo?.name as string | null) ?? null;
  const slug = (previo?.slug as string | null) ?? null;

  let cobros: Record<string, unknown>[];
  try {
    ({ filas: cobros } = await todasLasFilas<Record<string, unknown>>(
      (desde, hasta) => db.from('invoices').select(COLUMNAS_COBRO)
        .eq('restaurant_id', id).order('created_at').order('id').range(desde, hasta),
      50_000,
    ));
  } catch {
    throw new Error('No se borró el restaurante: no se pudieron leer sus cobros de Leogin. Intenta de nuevo.');
  }

  if (cobros.length) {
    const { error } = await db.from('super_admin_log').insert({
      actor_id: quien.actorId,
      actor_email: quien.actorEmail,
      action: 'restaurante.cobros-guardados',
      target_restaurant_id: id,
      target_label: nombre,
      meta: { slug, cuantos: cobros.length, cobros },
      ip: quien.ip,
    });
    if (error) {
      throw new Error('No se borró el restaurante: no se pudieron guardar sus cobros de Leogin en la bitácora. Intenta de nuevo.');
    }
  }

  const { error } = await db.from('restaurants').delete().eq('id', id);
  if (error) throw new Error(`No se pudo borrar el restaurante: ${error.message}`);

  // Sus fotos y comprobantes no caen con la cascada (LZ-10).
  const archivos = await borrarArchivosDelLocal(db, id);
  if (archivos.error) console.error('[restaurante.borrar] archivos', id, archivos.error);

  return { nombre, slug, cobrosGuardados: cobros.length, archivos };
}
