/* ============================================================
   ZONAS DE REPARTO (migraciones 103 / 104)
   ------------------------------------------------------------
   Única fuente de verdad de "a dónde llega el reparto y cuánto cuesta".
   Sustituye al arreglo de nombres en restaurants.delivery_zones, que quedó
   como histórico (ver migración 104).
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';

export interface DeliveryZone {
  id: string;
  nombre: string;
  tarifa: number;
  minutos_estimados: number | null;
  activo: boolean;
}

/** Zonas activas del restaurante, en el orden que definió el dueño. */
export async function getDeliveryZones(restaurantId: string): Promise<DeliveryZone[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('delivery_zones')
    .select('id, nombre, tarifa, minutos_estimados, activo')
    .eq('restaurant_id', restaurantId)
    .eq('activo', true)
    .order('sort_order');

  return ((data ?? []) as DeliveryZone[]).map((z) => ({ ...z, tarifa: Number(z.tarifa ?? 0) }));
}

/**
 * Tarifa de una zona por NOMBRE, que es como viaja en el pedido
 * (`orders.delivery_zone` es texto desde la migración 010).
 *
 * Devuelve null si el restaurante no tiene zonas configuradas o si el nombre
 * no corresponde a ninguna activa. El llamador decide qué hacer con eso —
 * aquí no se inventa una tarifa: en la ruta del dinero, "no sé" tiene que
 * poder distinguirse de "cero".
 */
export async function resolveZoneFee(
  restaurantId: string,
  zoneName: string | null | undefined,
): Promise<number | null> {
  if (!zoneName) return null;

  const zones = await getDeliveryZones(restaurantId);
  if (zones.length === 0) return null;

  const match = zones.find((z) => z.nombre.toLowerCase() === zoneName.trim().toLowerCase());
  return match ? match.tarifa : null;
}
