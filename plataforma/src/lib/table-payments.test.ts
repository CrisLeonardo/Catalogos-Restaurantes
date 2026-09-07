import { describe, it, expect } from 'vitest';
import { repartirPagos, metodoDominante, faltaPorCobrar } from './table-payments';

/* ════════════════════════════════════════════════════════════
   EL REPARTO DE LO QUE PAGÓ UNA MESA (M-11)
   ------------------------------------------------------------
   Esto mueve dinero real: lo que salga de aquí es lo que el dueño
   cuenta en el cajón al cerrar. Cada prueba de abajo es un descuadre
   que antes no se podía ni escribir.
   ════════════════════════════════════════════════════════════ */

const suma = (filas: { amount: number }[]) => Math.round(filas.reduce((s, f) => s + f.amount, 0) * 100) / 100;

describe('repartirPagos', () => {
  it('una mesa, un pedido, un método: la fila de siempre', () => {
    const filas = repartirPagos([{ id: 'a', total: 144.1 }], [{ method: 'CASH', amount: 144.1 }]);
    expect(filas).toEqual([{ orderId: 'a', method: 'CASH', amount: 144.1, cashReceived: null }]);
  });

  it('mitad efectivo y mitad tarjeta sobre un solo pedido', () => {
    // El caso del hallazgo: antes había que mentir en una de las dos.
    const filas = repartirPagos(
      [{ id: 'a', total: 400 }],
      [{ method: 'CASH', amount: 250 }, { method: 'CARD', amount: 150 }],
    );
    expect(filas).toEqual([
      { orderId: 'a', method: 'CASH', amount: 250, cashReceived: null },
      { orderId: 'a', method: 'CARD', amount: 150, cashReceived: null },
    ]);
  });

  it('un pago que cruza dos pedidos se parte donde toca', () => {
    const filas = repartirPagos(
      [{ id: 'a', total: 100 }, { id: 'b', total: 100 }],
      [{ method: 'CASH', amount: 150 }, { method: 'CARD', amount: 50 }],
    );
    expect(filas).toEqual([
      { orderId: 'a', method: 'CASH', amount: 100, cashReceived: null },
      { orderId: 'b', method: 'CASH', amount: 50, cashReceived: null },
      { orderId: 'b', method: 'CARD', amount: 50, cashReceived: null },
    ]);
    expect(suma(filas)).toBe(200);
  });

  it('el vuelto NO es ingreso: pagar Q500 una cuenta de Q400 son Q400', () => {
    const filas = repartirPagos(
      [{ id: 'a', total: 400 }],
      [{ method: 'CASH', amount: 400, cashReceived: 500 }],
    );
    expect(suma(filas)).toBe(400);
    // Lo recibido queda escrito para poder decir el vuelto, sin sumarse.
    expect(filas[0].cashReceived).toBe(500);
  });

  it('lo recibido en efectivo no se repite si el pago cruza dos pedidos', () => {
    // Repetirlo contaría Q500 dos veces al sumar la columna.
    const filas = repartirPagos(
      [{ id: 'a', total: 100 }, { id: 'b', total: 100 }],
      [{ method: 'CASH', amount: 200, cashReceived: 500 }],
    );
    expect(filas.map((f) => f.cashReceived)).toEqual([500, null]);
  });

  it('un cobro PARCIAL deja el resto sin cubrir, sin inventar nada', () => {
    // Lo que antes no existía en ninguna parte: la mitad ya cobrada.
    const filas = repartirPagos(
      [{ id: 'a', total: 100 }, { id: 'b', total: 100 }],
      [{ method: 'CARD', amount: 120 }],
    );
    expect(suma(filas)).toBe(120);
    expect(filas.filter((f) => f.orderId === 'b')).toHaveLength(1);
  });

  it('sin pagos no sale ninguna fila', () => {
    expect(repartirPagos([{ id: 'a', total: 100 }], [])).toEqual([]);
  });

  it('los pagos de importe cero o basura se descartan', () => {
    const filas = repartirPagos(
      [{ id: 'a', total: 100 }],
      [{ method: 'CASH', amount: 0 }, { method: 'CARD', amount: Number.NaN }, { method: 'CASH', amount: 100 }],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].method).toBe('CASH');
  });

  it('los céntimos cuadran: tres pedidos y dos pagos con decimales', () => {
    const ordenes = [{ id: 'a', total: 33.33 }, { id: 'b', total: 33.33 }, { id: 'c', total: 33.34 }];
    const filas = repartirPagos(ordenes, [{ method: 'CASH', amount: 50 }, { method: 'CARD', amount: 50 }]);
    expect(suma(filas)).toBe(100);
    // Y cada pedido queda cubierto exactamente por su total.
    for (const o of ordenes) {
      expect(suma(filas.filter((f) => f.orderId === o.id))).toBe(o.total);
    }
  });

  it('un pedido de total cero no consume pago', () => {
    const filas = repartirPagos(
      [{ id: 'cortesia', total: 0 }, { id: 'a', total: 50 }],
      [{ method: 'CASH', amount: 50 }],
    );
    expect(filas).toEqual([{ orderId: 'a', method: 'CASH', amount: 50, cashReceived: null }]);
  });
});

describe('metodoDominante', () => {
  it('gana el que más dinero puso', () => {
    expect(metodoDominante([
      { orderId: 'a', method: 'CASH', amount: 100, cashReceived: null },
      { orderId: 'a', method: 'CARD', amount: 300, cashReceived: null },
    ])).toBe('CARD');
  });

  it('suma las filas del mismo método antes de comparar', () => {
    expect(metodoDominante([
      { orderId: 'a', method: 'CASH', amount: 100, cashReceived: null },
      { orderId: 'b', method: 'CASH', amount: 100, cashReceived: null },
      { orderId: 'a', method: 'CARD', amount: 150, cashReceived: null },
    ])).toBe('CASH');
  });

  it('a igualdad gana el primero que se cobró', () => {
    expect(metodoDominante([
      { orderId: 'a', method: 'TRANSFER', amount: 50, cashReceived: null },
      { orderId: 'a', method: 'CARD', amount: 50, cashReceived: null },
    ])).toBe('TRANSFER');
  });

  it('sin filas se queda con el de siempre', () => {
    expect(metodoDominante([])).toBe('CASH');
  });
});

describe('faltaPorCobrar', () => {
  it('dice lo que queda', () => {
    expect(faltaPorCobrar(400, [{ method: 'CASH', amount: 250 }])).toBe(150);
  });

  it('nunca baja de cero aunque se pague de más', () => {
    expect(faltaPorCobrar(400, [{ method: 'CASH', amount: 500 }])).toBe(0);
  });
});
