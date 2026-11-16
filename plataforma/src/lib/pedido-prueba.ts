import 'server-only';

import { mintToken, readToken } from '@/lib/auth/signed-token';

/* ============================================================
   PEDIDO DE PRUEBA (ficha 2.2, migración 183)
   ------------------------------------------------------------
   El tercer paso de «Llega a tu primer pedido»: el dueño pide
   desde su propia carta y ve el pedido llegar a cocina. Para que
   ese pedido no cuente en cifras, caja, puntos ni existencias se
   marca `orders.es_prueba`.

   Quien marca es el servidor, nunca el navegador: el panel firma un
   pase con el id del restaurante y una caducidad corta, la carta lo
   lleva hasta `createOrder` y ahí se verifica. Sin firma válida, el
   pedido es un pedido normal. El pase vale solo para ese restaurante
   y no se puede fabricar ni alargar sin la clave del servidor.
   ============================================================ */

const SCOPE = 'pedido-prueba';
const VIGENCIA_MS = 2 * 60 * 60_000;

export function firmarPasePrueba(restaurantId: string): string {
  return mintToken(SCOPE, restaurantId, VIGENCIA_MS);
}

/** ¿El pase es válido para ESTE restaurante? */
export function pasePruebaValido(pase: string | undefined | null, restaurantId: string): boolean {
  if (!pase) return false;
  return readToken(SCOPE, pase) === restaurantId;
}
