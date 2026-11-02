/* OTRA RONDA — repetir lo último que pidió la mesa con un toque.
   ------------------------------------------------------------------
   En Toast se llama «Repeat»; en una mesa de amigos es la mitad de los
   pedidos de la noche: «otra igual». Se toma la ÚLTIMA ronda enviada (el
   último pedido vivo de la mesa) y se copia al carrito, donde el mesero
   la revisa y la manda como cualquier otra. Nunca se envía sola.

   Se copia CONTRA LA CARTA DE HOY, no contra la foto del pedido:
     · el precio es el actual (una ronda nueva es una venta nueva);
     · lo agotado o retirado no se copia, y se dice cuál;
     · las opciones se buscan por nombre en el plato de hoy. Si el dueño
       cambió el plato y ya no existe esa opción, el plato no se copia:
       repetir «Término medio» en un plato que ya no tiene términos sería
       mandar a cocina algo que no existe.
   El tiempo de la comida («Primer tiempo · …») no se repite: la segunda
   ronda ya no es del primer tiempo. El asiento sí.                     */

import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';
import { LIBRE_ID, newLineId, TIEMPOS, type CartLine } from '@/components/admin/waiter/cart';
import type { Product, ProductOptionGroup } from '@/types';

export interface RondaRepetida {
  lineas: CartLine[];
  /** Nombres de lo que no se pudo copiar (agotado, retirado o cambiado). */
  faltan: string[];
}

/** Quita «Primer tiempo · » y compañía del principio de la nota. */
function sinTiempo(nota: string | null): string | undefined {
  if (!nota) return undefined;
  let n = nota.trim();
  for (const t of TIEMPOS) {
    if (n === t.label) return undefined;
    if (n.startsWith(`${t.label} · `)) n = n.slice(t.label.length + 3).trim();
  }
  return n || undefined;
}

/** La última ronda con algo vivo, o null si la mesa no ha mandado nada. */
export function ultimaRonda(orders: OrderWithItems[]): OrderWithItems | null {
  const vivas = orders
    .filter((o) => o.status !== 'CANCEL')
    .filter((o) => o.items.some((it) => remainingQuantity(it, o.voids) > 0))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return vivas[0] ?? null;
}

export function otraRonda(orders: OrderWithItems[], products: Product[]): RondaRepetida {
  const ronda = ultimaRonda(orders);
  if (!ronda) return { lineas: [], faltan: [] };
  const porId = new Map(products.map((p) => [p.id, p]));
  const lineas: CartLine[] = [];
  const faltan: string[] = [];

  for (const item of ronda.items) {
    const cantidad = remainingQuantity(item, ronda.voids);
    if (cantidad <= 0) continue;
    const nota = sinTiempo(item.note);

    // Artículo libre: se repite tal cual, con el precio que alguien escribió.
    if (item.product_id == null) {
      lineas.push({
        lineId: newLineId(LIBRE_ID), productId: LIBRE_ID, name: item.name_snapshot,
        price: item.price_snapshot, quantity: cantidad, options: [], open: true,
        ...(nota ? { note: nota } : {}), seat: item.seat_no ?? null,
      });
      continue;
    }

    const p = porId.get(item.product_id);
    if (!p || !p.is_active || !p.is_available) { faltan.push(item.name_snapshot); continue; }

    const grupos = (p.options as ProductOptionGroup[] | null) ?? [];
    const opciones: CartLine['options'] = [];
    let cambiado = false;
    for (const o of item.options_snapshot ?? []) {
      const g = grupos.find((x) => x.name === o.group);
      const c = g?.choices.find((x) => x.name === o.choice);
      const v = o.variant ? c?.variants?.find((x) => x.name === o.variant) : undefined;
      if (!g || !c || (o.variant && !v)) { cambiado = true; break; }
      opciones.push({
        groupId: g.id, groupName: g.name, choiceId: c.id, choiceName: c.name,
        // Mismo cálculo que la hoja de opciones (el jsonb puede traer texto).
        priceDelta: (Number(c.priceDelta) || 0) + (v ? Number(v.priceDelta) || 0 : 0),
        ...(v ? { variantId: v.id, variantName: v.name } : {}),
      });
    }
    if (cambiado) { faltan.push(item.name_snapshot); continue; }

    lineas.push({
      lineId: newLineId(p.id), productId: p.id, name: p.name, price: p.price,
      quantity: cantidad, options: opciones,
      ...(nota ? { note: nota } : {}), seat: item.seat_no ?? null,
    });
  }

  return { lineas, faltan };
}
