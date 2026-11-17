import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { agruparBusquedas, type BusquedaSinRespuesta } from '@/lib/ayuda/sin-respuesta';

export type { BusquedaSinRespuesta };

/* Lo que se buscó en Ayuda y no tuvo respuesta (ficha 2.9, migración 186).
   Se agrupa por la frase sin acentos ni mayúsculas: lo que importa es qué
   se pide más, no cada búsqueda suelta. */

export async function listarBusquedasSinRespuesta(dias = 30): Promise<{ filas: BusquedaSinRespuesta[]; migracionPendiente: boolean }> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await createServiceClient()
    .from('ayuda_sin_respuesta')
    .select('frase, created_at, restaurants(name)')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    if (faltaLaTabla(error)) return { filas: [], migracionPendiente: true };
    throw new Error(error.message);
  }
  const filas = (data ?? []).map((f) => ({
    frase: f.frase as string,
    fecha: f.created_at as string,
    restaurante: (f.restaurants as unknown as { name?: string } | null)?.name ?? null,
  }));
  return { filas: agruparBusquedas(filas), migracionPendiente: false };
}
