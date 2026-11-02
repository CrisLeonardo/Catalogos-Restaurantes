/* Cuántos pedidos lleva un restaurante en el mes del calendario, en su
   zona horaria. Lo usa el tope blando del plan En línea
   (lib/tope-pedidos.ts). Una sola consulta de conteo, sin traer filas. */

import { createServiceClient } from '@/lib/supabase/service';
import { localDateKey } from '@/lib/hours';
import { medianocheLocalUtc } from '@/lib/periodo';
import { primerDiaDelMes } from '@/lib/tope-pedidos';

export async function pedidosDelMes(restaurantId: string, timezone: string): Promise<number> {
  if (!restaurantId) return 0;
  const desde = medianocheLocalUtc(primerDiaDelMes(localDateKey(new Date(), timezone)), timezone);
  const db = createServiceClient();
  const { count, error } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', desde)
    .neq('status', 'CANCEL');
  if (error) return 0;
  return count ?? 0;
}
