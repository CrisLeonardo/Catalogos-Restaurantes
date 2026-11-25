import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/** El cupo vigente de un platillo: el saldo del último conteo (el inicio del
    control o la última tanda que se fijó). Con él, la ficha dice «quedan 4 ·
    vendidas 26». Null si nunca se contó. Ver `fijarCupo` en actions/inventory. */
export async function cupoVigente(restaurantId: string, productId: string): Promise<number | null> {
  const { data } = await createServiceClient().from('stock_movements').select('balance_after')
    .eq('restaurant_id', restaurantId).eq('product_id', productId).eq('reason', 'conteo')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const n = Number((data as { balance_after?: number | string } | null)?.balance_after);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
