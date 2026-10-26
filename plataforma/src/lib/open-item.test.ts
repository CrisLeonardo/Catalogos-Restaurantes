import { describe, it, expect } from 'vitest';
import { createOrderSchema, waiterOrderSchema } from './schemas';

/* ════════════════════════════════════════════════════════════
   EL ARTÍCULO LIBRE (M-09)
   ------------------------------------------------------------
   Cobrar algo que no está en la carta: el plato del día que nadie dio
   de alta, un descorche, un recargo. Es la ÚNICA línea del sistema
   cuyo precio lo escribe una persona en vez de salir del catálogo, así
   que el candado no es una comprobación que alguien tenga que acordarse
   de hacer: son dos esquemas distintos, y el del público no conoce el
   campo. Esto es lo que fija esa frontera.
   ════════════════════════════════════════════════════════════ */

const MESA = {
  restaurantId: '11111111-1111-1111-1111-111111111111',
  customer: { name: 'Mesa 4', phone: '', type: 'DINE_IN' as const, tableNumber: 4 },
};

const PLATO = {
  productId: '22222222-2222-2222-2222-222222222222',
  name: 'Pepián',
  price: 65,
  quantity: 1,
};

const DESCORCHE = { name: 'Descorche', price: 75, quantity: 2 };

describe('la frontera entre el público y el mesero', () => {
  it('el mesero puede cobrar algo que no está en la carta', () => {
    const r = waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [DESCORCHE] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.openItems).toHaveLength(1);
  });

  it('el checkout público NO puede: el campo ni siquiera existe para él', () => {
    const r = createOrderSchema.safeParse({ ...MESA, items: [PLATO], openItems: [DESCORCHE] });
    expect(r.success).toBe(true);
    // Zod descarta lo que no conoce. No es que se ignore más adelante:
    // es que no llega.
    if (r.success) expect('openItems' in r.data).toBe(false);
  });

  it('un pedido de SOLO artículos libres es válido para el mesero', () => {
    // Un descorche solo, o un recargo por servicio. Con la regla del
    // público esto era «El carrito está vacío».
    expect(waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [DESCORCHE] }).success).toBe(true);
  });

  it('…y sigue sin poder mandarse un pedido de verdad vacío', () => {
    const r = waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('El carrito está vacío');
  });

  it('el público sigue necesitando al menos una línea de la carta', () => {
    const r = createOrderSchema.safeParse({ ...MESA, items: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('El carrito está vacío');
  });
});

describe('lo que se acota del precio abierto', () => {
  it('el nombre no puede ir vacío: una línea sin nombre en la cuenta no se puede discutir', () => {
    expect(waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, name: '  ' }] }).success)
      .toBe(false);
  });

  it('cero sí vale: una cortesía es un artículo libre a Q0', () => {
    expect(waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, price: 0 }] }).success)
      .toBe(true);
  });

  it('un precio negativo no: un descuento no se cuela por aquí', () => {
    expect(waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, price: -50 }] }).success)
      .toBe(false);
  });

  it('hay techo, por si alguien teclea de más', () => {
    expect(waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, price: 100_001 }] }).success)
      .toBe(false);
  });

  it('el asiento llega hasta 40, como el resto del reparto (M-13)', () => {
    const ok = waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, seat: 40 }] });
    const no = waiterOrderSchema.safeParse({ ...MESA, items: [], openItems: [{ ...DESCORCHE, seat: 41 }] });
    expect(ok.success).toBe(true);
    expect(no.success).toBe(false);
  });
});

describe('las reglas que NO cambian por tener su propio esquema', () => {
  it('un envío a domicilio sigue necesitando dirección', () => {
    const r = waiterOrderSchema.safeParse({
      restaurantId: MESA.restaurantId,
      items: [PLATO],
      openItems: [],
      customer: { name: 'Ana', phone: '55551234', type: 'DELIVERY' as const },
    });
    expect(r.success).toBe(false);
  });

  it('lo que no es en mesa sigue necesitando teléfono', () => {
    const r = waiterOrderSchema.safeParse({
      restaurantId: MESA.restaurantId,
      items: [PLATO],
      openItems: [],
      customer: { name: 'Ana', phone: '', type: 'PICKUP' as const },
    });
    expect(r.success).toBe(false);
  });
});
