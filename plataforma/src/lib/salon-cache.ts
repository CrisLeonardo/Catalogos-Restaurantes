import { revalidatePath } from 'next/cache';

/**
 * LAS PANTALLAS QUE ENSEÑAN EL SALÓN
 * ------------------------------------------------------------
 * Hallazgo M-25. `revalidatePath('/admin/mesas')` estaba en cuatro
 * acciones y faltaba en seis —`createWaiterOrder`, `freeTable`,
 * `updateOrderStatus`, `voidOrder`, `setItemSeat` y
 * `archiveAbandonedTables`—, y cada una de las diez recordaba un
 * subconjunto distinto de rutas. Hoy no rompe nada porque las páginas son
 * dinámicas y el `router.refresh()` del cliente lo tapa; el problema es
 * que es **media regla**, y el próximo cambio que se apoye en ella la va a
 * encontrar mintiendo.
 *
 * Así que la regla vive aquí, una sola vez, y las acciones la llaman.
 *
 * **No intenta ser quirúrgica a propósito.** Se podría afinar cuáles de
 * las cinco toca cada acción, pero eso es exactamente lo que produjo diez
 * versiones distintas de la misma lista. Sobre páginas dinámicas, marcar
 * una de más no cuesta nada medible; olvidarse de una sí.
 */
export function revalidarSalon() {
  revalidatePath('/admin/mesas');    // el salón del encargado
  revalidatePath('/admin/mesero');   // el salón del mesero
  revalidatePath('/admin/pedidos');  // la lista de pedidos vivos
  revalidatePath('/admin/cocina');   // la pantalla de cocina
  revalidatePath('/admin/caja');     // el arqueo, que cuenta lo cobrado
}
