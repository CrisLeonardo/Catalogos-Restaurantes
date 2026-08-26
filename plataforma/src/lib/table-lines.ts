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
import type { OrderItemOption } from '@/types';

export interface TableLine {
  qty: number;
  name: string;
  /** "En cocina", "Servido"… tal como los nombra el resto del panel. */
  estado: string;
  /** Token de color con el que se pinta el punto de estado. */
  color: string;
  /** Lo que suman esas unidades. La mesa enseña el importe de cada
      renglón, no solo el total: es lo que permite cantar la cuenta en voz
      alta sin abrir el reparto. */
  amount: number;
  /** Cómo se pidió: "Término medio · sin cebolla". Cadena vacía si se pidió
      tal cual. Es media comanda: dos carnes asadas no son lo mismo si una va
      sin cebolla, y hasta ahora esa mitad no se veía en la mesa. */
  detalle: string;
}

/** Las opciones elegidas y la nota, en una línea. */
function detalleDe(item: { options_snapshot?: OrderItemOption[] | null; note?: string | null }): string {
  const partes: string[] = [];
  for (const o of item.options_snapshot ?? []) if (o?.choice) partes.push(o.choice);
  if (item.note) partes.push(item.note);
  return partes.join(' · ');
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
 * Se agrupa por nombre, estado Y cómo se pidió, a propósito: dos carnes
 * asadas en cocina y una servida son dos renglones, no tres unidades de lo
 * mismo — para el mesero es justo la diferencia que importa. Y una que va sin
 * cebolla tampoco se junta con las demás, por la misma razón.
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
      /* El precio ya congelado incluye lo que costaron las opciones
         (price_snapshot se guarda con el recargo aplicado), así que
         multiplicar por las unidades que quedan vivas basta. */
      const importe = Number(it.price_snapshot ?? 0) * qty;
      const detalle = detalleDe(it);
      const clave = `${it.name_snapshot}|${estado}|${detalle}`;
      const prev = acc.get(clave);
      if (prev) { prev.qty += qty; prev.amount += importe; }
      else acc.set(clave, { qty, name: it.name_snapshot, estado, color, amount: importe, detalle });
    }
  }

  return [...acc.values()];
}
