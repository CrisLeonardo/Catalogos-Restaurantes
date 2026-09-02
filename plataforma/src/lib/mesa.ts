/**
 * LA MESA DE UN PEDIDO
 * ------------------------------------------------------------
 * Qué mesa es un pedido se decidía leyendo `address` con
 * `/Mesa\s+(\d+)/i`, en cinco sitios distintos: la pantalla Hoy, el
 * tablero de pedidos, la de cocina, la ocupación del salón y la rotación
 * del día. Cinco copias del mismo regex, y con ellas la puerta cerrada a
 * lo primero que pide un restaurante con más de un ambiente: mesas con
 * nombre —«Terraza 2», «Barra A»—, que romperían las cinco a la vez.
 *
 * Desde la migración 127 la identidad es `orders.table_number` (int) y
 * `address` es solo el texto que se imprime. Aquí queda el ÚNICO regex,
 * y solo como red mientras la migración no esté en todas partes.
 *
 * Puro a propósito: la pantalla de cocina es un componente de cliente y
 * no puede arrastrar nada del servidor.
 */

/** El texto que se imprime para una mesa. La identidad es el número. */
export function direccionDeMesa(tableNumber: number): string {
  return `Mesa ${tableNumber}`;
}

/**
 * El número de mesa de una fila de `orders`.
 *
 * Prefiere la columna; cae al texto donde la 127 todavía no ha corrido.
 * `null` = no es una mesa (para llevar, domicilio) o nadie la anotó.
 */
export function mesaDeFila(
  row: { table_number?: number | null; address?: string | null } | null | undefined,
): number | null {
  if (!row) return null;
  if (typeof row.table_number === 'number' && Number.isFinite(row.table_number)) return row.table_number;
  const m = row.address?.match(/Mesa\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** «Mesa 4» o el texto de reserva, para pintar un renglón. */
export function etiquetaDeMesa(
  row: { table_number?: number | null; address?: string | null } | null | undefined,
  siNoHay = 'En local',
): string {
  const n = mesaDeFila(row);
  if (n != null) return direccionDeMesa(n);
  return row?.address?.trim() || siNoHay;
}
