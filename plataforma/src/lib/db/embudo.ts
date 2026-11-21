import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type Lectura } from '@/lib/db/lectura';

/* ============================================================
   EMBUDO DE LA CARTA · lectura para el panel (CV-37, migración 188)
   ------------------------------------------------------------
   Cuántos comensales (personas por día, anónimas) llegaron a cada
   paso, por canal, en un rango de días del negocio. Sin la tabla
   (migración pendiente) → estado 'falta-migracion' y la tarjeta
   no se pinta.
   ============================================================ */

export const PASOS_EMBUDO = ['apertura', 'ficha', 'agregar', 'checkout', 'pedido'] as const;
export const CANALES_EMBUDO = ['mesa', 'general', 'platillo'] as const;
export type PasoEmbudoDb = (typeof PASOS_EMBUDO)[number];
export type CanalEmbudoDb = (typeof CANALES_EMBUDO)[number];
export type Embudo = Record<CanalEmbudoDb, Record<PasoEmbudoDb, number>>;

const vacio = (): Embudo => Object.fromEntries(
  CANALES_EMBUDO.map((c) => [c, Object.fromEntries(PASOS_EMBUDO.map((p) => [p, 0]))]),
) as Embudo;

const TOPE = 20000;

export async function getEmbudoCarta(restaurantId: string, from: string, to: string): Promise<Lectura<Embudo>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('menu_embudo')
    .select('canal, paso')
    .eq('restaurant_id', restaurantId)
    .gte('dia', from)
    .lte('dia', to)
    .limit(TOPE);
  const embudo = vacio();
  for (const r of (data ?? []) as { canal: CanalEmbudoDb; paso: PasoEmbudoDb }[]) {
    if (embudo[r.canal] && r.paso in embudo[r.canal]) embudo[r.canal][r.paso]++;
  }
  return lecturaDe(error, embudo, vacio(), { parcial: (data?.length ?? 0) >= TOPE, contexto: 'embudo de la carta' });
}
