import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaMigracion } from '@/lib/db/migracion-ausente';

/* Datos de la Vitrina en modo lanzamiento (migración 141).

   Las tablas no tienen políticas: solo el servidor las lee, y aquí se piden
   únicamente las columnas que el menú enseña. Lo vendido por pieza
   (`units_sold`) es dato del negocio y no sale hacia el navegador. */

/** Una edición cerrada, como la enseña el menú. */
export interface EdicionArchivada {
  id: string;
  title: string;
  opensAt: string | null;
  closesAt: string;
  /** Toda la edición agotada: hora de la última pieza en acabarse. */
  soldOutAt: string | null;
  /** Foto de portada: la de la primera pieza que tenga. */
  image: string | null;
  piezas: number;
}

const LIMITE_ARCHIVO = 8;

/** Las últimas ediciones cerradas, de la más reciente a la más vieja. Sin la
    migración 141 devuelve una lista vacía: el menú sale sin archivo. */
export function getArchivoVitrinaCached(restaurantId: string): Promise<EdicionArchivada[]> {
  return unstable_cache(
    async () => {
      const db = createServiceClient();
      const { data, error } = await db
        .from('drop_editions')
        .select('id, title, opens_at, closes_at, sold_out_at, drop_edition_items(position, image_url)')
        .eq('restaurant_id', restaurantId)
        .order('closes_at', { ascending: false })
        .limit(LIMITE_ARCHIVO);
      if (error) {
        if (faltaLaMigracion(error)) return [];
        throw error;
      }
      return (data ?? []).map((e) => {
        const piezas = ((e.drop_edition_items as Array<{ position: number; image_url: string | null }> | null) ?? [])
          .slice()
          .sort((a, b) => a.position - b.position);
        return {
          id: e.id as string,
          title: e.title as string,
          opensAt: (e.opens_at as string | null) ?? null,
          closesAt: e.closes_at as string,
          soldOutAt: (e.sold_out_at as string | null) ?? null,
          image: piezas.find((p) => p.image_url)?.image_url ?? null,
          piezas: piezas.length,
        };
      });
    },
    ['vitrina-archivo', restaurantId],
    { revalidate: 60, tags: [`menu:${restaurantId}`, `vitrina:${restaurantId}`] },
  )();
}

/** Unidades vendidas por producto desde `desde` (pedidos no cancelados).
    Para «Quedan 9 de 30»: las que había al abrir = las que quedan + estas. */
export function getVendidosDesdeCached(restaurantId: string, desde: string): Promise<Record<string, number>> {
  return unstable_cache(
    async () => {
      const db = createServiceClient();
      const { data, error } = await db
        .from('order_items')
        .select('product_id, quantity, order:orders!inner(restaurant_id, created_at, status)')
        .eq('order.restaurant_id', restaurantId)
        .gte('order.created_at', desde)
        .neq('order.status', 'CANCEL')
        .not('product_id', 'is', null)
        .limit(5000);
      if (error || !data) return {};
      const out: Record<string, number> = {};
      for (const row of data as Array<{ product_id: string | null; quantity: number }>) {
        if (!row.product_id) continue;
        out[row.product_id] = (out[row.product_id] ?? 0) + (Number(row.quantity) || 0);
      }
      return out;
    },
    ['vitrina-vendidos', restaurantId, desde],
    { revalidate: 60, tags: [`menu:${restaurantId}`] },
  )();
}

/** Pega `stock_total` (quedan + vendidas) a los productos que ya traen
    `stock_left`. Solo cambia los que el aviso «Quedan pocas» ya enseña. */
export function withStockTotal<T extends { id: string; stock_left?: number | null }>(
  products: T[],
  vendidos: Record<string, number>,
): Array<T & { stock_total?: number }> {
  return products.map((p) =>
    p.stock_left != null ? { ...p, stock_total: p.stock_left + (vendidos[p.id] ?? 0) } : p,
  );
}
