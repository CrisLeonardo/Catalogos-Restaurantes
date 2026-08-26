/**
 * Lo que hay EN una mesa, listo para pintar.
 *
 * Una mesa suele acumular varias comandas (la entrada, luego los fuertes,
 * luego el café). Para quien la mira eso no son tres pedidos: es una mesa
 * con platos, unos servidos y otros en cocina. Esto convierte lo segundo
 * en lo primero.
 *
 * Vive aparte del componente porque es la única parte del expediente que
 * no se puede comprobar mirando la pantalla.
 */
import { STATUS_LABEL_SHORT } from '@/lib/order-status';
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';

export interface TableLine {
  qty: number;
  name: string;
  /** "En cocina", "Servido"… tal como los nombra el resto del panel. */
  estado: string;
  /** Token de color con el que se pinta el punto de estado. */
  color: string;
}

/** Verde lo que ya llegó a la mesa, acento lo que espera a que lo lleven,
    ámbar lo que sigue en cocina. Mismo criterio que los chips del panel. */
function colorDe(status: string): string {
  if (status === 'SERVED' || status === 'DELIVERED') return 'var(--c-ok)';
  if (status === 'READY') return 'var(--brand-accent-ink)';
  return 'var(--c-warn)';
}

/**
 * Agrupa los platos de todas las comandas activas de una mesa.
 *
 * Se agrupa por nombre Y estado a propósito: dos carnes asadas en cocina y
 * una servida son dos renglones, no tres unidades de lo mismo — para el
 * mesero es justo la diferencia que importa.
 *
 * Las unidades anuladas no cuentan (remainingQuantity), y una línea que
 * quedó en cero desaparece en vez de mostrarse como "0×".
 */
export function groupTableLines(orders: OrderWithItems[]): TableLine[] {
  const acc = new Map<string, TableLine>();

  for (const o of orders) {
    if (o.status === 'CANCEL') continue;
    const estado = STATUS_LABEL_SHORT[o.status] ?? o.status;
    const color = colorDe(o.status);

    for (const it of o.items ?? []) {
      const qty = remainingQuantity(it, o.voids ?? []);
      if (qty <= 0) continue;
      const clave = `${it.name_snapshot}|${estado}`;
      const prev = acc.get(clave);
      if (prev) prev.qty += qty;
      else acc.set(clave, { qty, name: it.name_snapshot, estado, color });
    }
  }

  return [...acc.values()];
}
