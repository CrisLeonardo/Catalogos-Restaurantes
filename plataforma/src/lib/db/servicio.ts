/**
 * LOS MÁS PEDIDOS.
 *
 * La fila de seis platos a un toque que abre la carta del módulo de
 * servicio. Sale de lo que este restaurante vende de verdad y no de una
 * lista que alguien tenga que mantener a mano: una lista a mano se
 * escribe el primer día y no se vuelve a tocar, y para la segunda semana
 * los seis atajos son los seis platos equivocados.
 *
 * Ventana de dos semanas: lo bastante larga para que un martes flojo no
 * la mueva entera, lo bastante corta para que el plato que salió de la
 * carta desaparezca solo.
 */

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

/** Cuántos días mirar hacia atrás. */
const DIAS = 14;

/** Cuántos devolver. La fila enseña seis; los atajos de teclado, nueve. */
const CUANTOS = 9;

async function leerMasPedidos(restaurantId: string): Promise<string[]> {
  const db = createServiceClient();
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();

  /* Se cuentan UNIDADES, no renglones: un plato que se pide de cuatro en
     cuatro pesa más que uno que se pide de uno en uno cuatro veces, y en
     una comanda eso es exactamente lo que quieres a un toque.

     Los pedidos cancelados quedan fuera —no se vendieron— y los de
     mostrador y domicilio entran igual: lo más pedido del local es lo más
     pedido del local, salga por donde salga. */
  const { data, error } = await db
    .from('order_items')
    .select('product_id, quantity, order:orders!inner(restaurant_id, created_at, status)')
    .eq('order.restaurant_id', restaurantId)
    .gte('order.created_at', desde)
    .neq('order.status', 'CANCEL')
    .not('product_id', 'is', null)
    .limit(4000);

  if (error) return [];

  const suma = new Map<string, number>();
  for (const row of (data ?? []) as unknown as { product_id: string | null; quantity: number }[]) {
    if (!row.product_id) continue;
    suma.set(row.product_id, (suma.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  }

  return [...suma.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CUANTOS)
    .map(([id]) => id);
}

/**
 * Cacheado con la MISMA etiqueta que el menú (`menu:<id>`).
 *
 * No porque el dato sea del menú, sino porque es la etiqueta que ya
 * invalidan las acciones de carta e inventario: un plato que el dueño
 * acaba de dar de baja tiene que salir de los atajos sin esperar a que
 * caduque nada. Para lo demás, quince minutos sobran — el ranking de dos
 * semanas no cambia entre dos comandas.
 */
export function getMasPedidosCached(restaurantId: string): Promise<string[]> {
  return unstable_cache(
    () => leerMasPedidos(restaurantId),
    ['servicio-mas-pedidos', restaurantId],
    { tags: [`menu:${restaurantId}`], revalidate: 900 },
  )();
}
