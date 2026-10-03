import { createServiceClient } from '@/lib/supabase/service';
import { medianocheLocalUtc, sumarDias } from '@/lib/periodo';

/**
 * Cuántas visitas al menú hubo entre dos fechas locales (ambas incluidas).
 *
 * Para la comparación de Negocio › Resumen (D-3): el resumen de `visit_stats`
 * trae los últimos 7 y 30 días, pero no los 30 ANTERIORES. Un conteo con
 * `head` sobre el índice (restaurant_id, created_at) no trae filas: solo el
 * número. Quien llama ya comprobó el acceso al restaurante.
 */
export async function countVisitsInRange(
  restaurantId: string,
  from: string,
  to: string,
  timezone: string,
): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return 0;
  const db = createServiceClient();
  const { count, error } = await db
    .from('page_visits')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', medianocheLocalUtc(from, timezone))
    .lt('created_at', medianocheLocalUtc(sumarDias(to, 1), timezone));
  if (error) return 0;
  return count ?? 0;
}
