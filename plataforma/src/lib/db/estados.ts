import 'server-only';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaMigracion } from '@/lib/db/migracion-ausente';

/* ============================================================
   ESTADOS DEL DÍA · lectura (auditoría «La carta que vende», CV-32)
   ------------------------------------------------------------
   Los vigentes (no caducados) de un restaurante, del más nuevo al más
   viejo. Para la carta pública, en caché 60 s con la etiqueta
   `estados:<id>` (la invalida publicar o borrar). Sin la tabla
   (migración 189 pendiente) o con la lectura caída → []: los estados
   son un extra y la carta no se detiene por ellos.
   ============================================================ */

export interface EstadoDelDia {
  id: string;
  imagen_url: string;
  texto: string | null;
  platillo_id: string | null;
  created_at: string;
  expira_at: string;
}

const COLUMNAS = 'id, imagen_url, texto, platillo_id, created_at, expira_at';
const MAX = 10;

export async function getEstadosVigentes(restaurantId: string): Promise<{ estados: EstadoDelDia[]; faltaTabla: boolean }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('menu_estados')
    .select(COLUMNAS)
    .eq('restaurant_id', restaurantId)
    .gt('expira_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX);
  if (error) return { estados: [], faltaTabla: faltaLaMigracion(error) };
  return { estados: (data ?? []) as EstadoDelDia[], faltaTabla: false };
}

export function getEstadosVigentesCached(restaurantId: string): Promise<EstadoDelDia[]> {
  return unstable_cache(
    async () => (await getEstadosVigentes(restaurantId)).estados,
    ['estados-del-dia', restaurantId],
    { revalidate: 60, tags: [`estados:${restaurantId}`] },
  )();
}
