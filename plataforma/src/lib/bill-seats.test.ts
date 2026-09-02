/* El reparto que sale de los asientos apuntados al pedir.
   ------------------------------------------------------------------
   Es dinero: de esto depende cuánto le toca pagar a cada quien cuando
   la mesa dice «cada quien lo suyo». El fallo que estas pruebas cubren
   es el que había en producción — el asiento se guardaba al tomar la
   comanda y el cobro lo ignoraba por completo. */
import { describe, it, expect } from 'vitest';
import { splitFromSeats, computeSplit, type BillLine } from './bill-split';
import type { OrderWithItems } from './db/orders';

function linea(itemId: string, seat: number | null, quantity = 1, unitPrice = 100): BillLine {
  return {
    itemId,
    orderId: 'o1',
    orderNumber: '#1',
    orderStatus: 'SERVED',
    name: `Plato ${itemId}`,
    options: null,
    quantity,
    voidedQuantity: 0,
    unitPrice,
    lineTotal: unitPrice * quantity,
    note: null,
    seat,
  };
}

describe('splitFromSeats', () => {
  it('no siembra nada cuando ningún plato lleva asiento', () => {
    expect(splitFromSeats([linea('a', null), linea('b', null)])).toBeNull();
  });

  it('no siembra nada con una cuenta vacía', () => {
    expect(splitFromSeats([])).toBeNull();
  });

  it('crea un comensal por asiento usado y le da sus platos', () => {
    const r = splitFromSeats([linea('a', 1), linea('b', 2), linea('c', 1)]);
    expect(r).not.toBeNull();
    expect(r!.peopleIds).toEqual(['1', '2']);
    expect(r!.assignment).toEqual({ a: ['1'], b: ['2'], c: ['1'] });
  });

  it('ordena los comensales por número de asiento, no por orden de llegada', () => {
    // El postre del asiento 3 se pidió antes que la bebida del 1.
    const r = splitFromSeats([linea('postre', 3), linea('bebida', 1), linea('sopa', 2)]);
    expect(r!.peopleIds).toEqual(['1', '2', '3']);
  });

  it('deja SIN ASIGNAR lo que se pidió para la mesa', () => {
    // Repartir en silencio el pan de la mesa es justo lo que descuadra
    // un cobro: tiene que verse en su renglón y decidirlo alguien.
    const r = splitFromSeats([linea('pepian', 1), linea('pan-de-mesa', null)]);
    expect(r!.assignment).toEqual({ pepian: ['1'] });
    expect(r!.assignment['pan-de-mesa']).toBeUndefined();
  });

  it('ignora las líneas anuladas por completo', () => {
    const anulada = { ...linea('anulado', 4), quantity: 0, voidedQuantity: 1 };
    const r = splitFromSeats([linea('vivo', 1), anulada]);
    expect(r!.peopleIds).toEqual(['1']);
    expect(r!.assignment.anulado).toBeUndefined();
  });

  it('el reparto sembrado cuadra con el total de la mesa', () => {
    /* La comprobación que de verdad importa: lo que se siembra tiene que
       poder cobrarse sin que sobre ni falte un centavo. Tres platos de
       Q33.33 con propina de Q10 en una sola cuenta de Q110. */
    const lines = [linea('a', 1, 1, 33.33), linea('b', 2, 1, 33.33), linea('c', 3, 1, 33.34)];
    const semilla = splitFromSeats(lines)!;

    const orders = [{
      id: 'o1',
      total: 110,
      tip: 10,
      delivery_fee: 0,
      discount: 0,
      loyalty_discount: 0,
      status: 'SERVED',
      order_number: '#1',
      items: [
        { id: 'a', name_snapshot: 'Plato a', quantity: 1, price_snapshot: 33.33, subtotal: 33.33, seat_no: 1 },
        { id: 'b', name_snapshot: 'Plato b', quantity: 1, price_snapshot: 33.33, subtotal: 33.33, seat_no: 2 },
        { id: 'c', name_snapshot: 'Plato c', quantity: 1, price_snapshot: 33.34, subtotal: 33.34, seat_no: 3 },
      ],
      voids: [],
    }] as unknown as OrderWithItems[];

    const { people, unassigned } = computeSplit({
      orders,
      mode: 'byItem',
      peopleIds: semilla.peopleIds,
      assignment: semilla.assignment,
    });

    expect(unassigned).toBeNull();
    const suma = people.reduce((s, p) => s + p.total, 0);
    expect(suma).toBeCloseTo(110, 2);
  });
});
