/* ============================================================
   LÍMITE DE PEDIDOS DEL PÚBLICO (auditoría de lanzamiento, LZ-02)
   ------------------------------------------------------------
   Antes: 6 pedidos por minuto por IP y local. Pero muchos teléfonos
   comparten una sola IP: los clientes conectados al wifi del local, los
   que llegan por datos móviles detrás del mismo NAT del operador y una
   integración que manda pedidos desde un solo servidor. En una hora pico
   el 7.º pedido del minuto se rechazaba aunque fuera de otra persona (el
   ensayo del turno con `--misma-red` lo reprodujo).

   Ahora son dos cubos:
   · por IP y local, 30 por minuto: aguanta un comedor lleno en el mismo
     wifi y sigue frenando una inundación desde un solo lugar;
   · por teléfono y local, 6 por minuto: el freno por persona de antes.
     El teléfono lo escribe el cliente, así que no es un candado: quien lo
     cambie en cada pedido sigue topado por el cubo de la IP.
   Los pedidos sin teléfono (la cuenta compartida de la mesa) solo usan el
   de la IP.
   ============================================================ */

export const PEDIDOS_POR_IP = 30;
export const PEDIDOS_POR_TELEFONO = 6;
const UN_MINUTO = 60_000;

export type Cubo = { clave: string; max: number; ventanaMs: number };

export function cubosDelPedido(ip: string, restaurantId: string, telefono: string | undefined): Cubo[] {
  const cubos: Cubo[] = [{ clave: `order:${ip}:${restaurantId}`, max: PEDIDOS_POR_IP, ventanaMs: UN_MINUTO }];
  const digitos = (telefono ?? '').replace(/\D/g, '');
  // Los últimos 8: «+502 5555-1234» y «55551234» son la misma persona.
  if (digitos.length >= 8) {
    cubos.push({ clave: `order-tel:${restaurantId}:${digitos.slice(-8)}`, max: PEDIDOS_POR_TELEFONO, ventanaMs: UN_MINUTO });
  }
  return cubos;
}
