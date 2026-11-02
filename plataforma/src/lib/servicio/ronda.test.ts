/**
 * «Otra ronda»: copiar la última ronda contra la carta de HOY. Lo que se
 * prueba es lo que podría mandar a cocina algo falso: lo anulado, lo
 * agotado, una opción que ya no existe y el tiempo de la comida.
 */
import { describe, it, expect } from 'vitest';
import { otraRonda, ultimaRonda } from './ronda';
import type { OrderWithItems } from '@/lib/db/orders';
import type { OrderItem, Product } from '@/types';

function item(o: Partial<OrderItem>): OrderItem {
  return {
    id: crypto.randomUUID(), order_id: 'o', product_id: 'lim', name_snapshot: 'Limonada',
    price_snapshot: 18, cost_snapshot: null, quantity: 1, subtotal: 18,
    options_snapshot: null, note: null, seat_no: null, ...o,
  };
}

function pedido(created_at: string, items: OrderItem[], extra: Partial<OrderWithItems> = {}): OrderWithItems {
  return { id: created_at, status: 'PREP', created_at, items, voids: [], ...extra } as unknown as OrderWithItems;
}

function plato(o: Partial<Product>): Product {
  return { id: 'lim', name: 'Limonada', price: 20, is_active: true, is_available: true, options: null, ...o } as Product;
}

const CARTA: Product[] = [
  plato({}),
  plato({ id: 'gal', name: 'Cerveza Gallo', price: 25 }),
  plato({
    id: 'mar', name: 'Margarita', price: 75,
    options: [{ id: 'g1', name: 'Tamaño', type: 'single', required: true, choices: [
      { id: 'c1', name: 'Mediana', priceDelta: 0 }, { id: 'c2', name: 'Grande', priceDelta: 20 },
    ] }],
  }),
  plato({ id: 'nac', name: 'Nachos', price: 40, is_available: false }),
];

describe('ultimaRonda', () => {
  it('es el pedido vivo más reciente', () => {
    const viejo = pedido('2026-11-02T20:00:00Z', [item({})]);
    const nuevo = pedido('2026-11-02T21:00:00Z', [item({ product_id: 'gal' })]);
    expect(ultimaRonda([nuevo, viejo])?.id).toBe(nuevo.id);
  });

  it('salta lo cancelado y lo anulado entero', () => {
    const bueno = pedido('2026-11-02T20:00:00Z', [item({})]);
    const cancelado = pedido('2026-11-02T21:00:00Z', [item({})], { status: 'CANCEL' } as Partial<OrderWithItems>);
    const anulado = pedido('2026-11-02T22:00:00Z', [item({ id: 'x', quantity: 2 })], {
      voids: [{ item_id: 'x', quantity: 2 }],
    } as unknown as Partial<OrderWithItems>);
    expect(ultimaRonda([bueno, cancelado, anulado])?.id).toBe(bueno.id);
  });
});

describe('otraRonda', () => {
  it('copia cantidades, asiento y opciones con el precio de hoy', () => {
    const r = otraRonda([pedido('2026-11-02T21:00:00Z', [
      item({ quantity: 3, seat_no: 2 }),
      item({ product_id: 'mar', name_snapshot: 'Margarita', options_snapshot: [{ group: 'Tamaño', choice: 'Grande', priceDelta: 15 }] }),
    ])], CARTA);
    expect(r.faltan).toEqual([]);
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]).toMatchObject({ productId: 'lim', quantity: 3, price: 20, seat: 2 });
    expect(r.lineas[1].options[0]).toMatchObject({ choiceId: 'c2', priceDelta: 20 });
  });

  it('no copia lo agotado, lo retirado ni una opción que ya no existe, y lo dice', () => {
    const r = otraRonda([pedido('2026-11-02T21:00:00Z', [
      item({ product_id: 'nac', name_snapshot: 'Nachos' }),
      item({ product_id: 'borrado', name_snapshot: 'Plato viejo' }),
      item({ product_id: 'mar', name_snapshot: 'Margarita', options_snapshot: [{ group: 'Tamaño', choice: 'Jarra', priceDelta: 0 }] }),
      item({ product_id: 'gal', name_snapshot: 'Cerveza Gallo' }),
    ])], CARTA);
    expect(r.lineas.map((l) => l.productId)).toEqual(['gal']);
    expect(r.faltan).toEqual(['Nachos', 'Plato viejo', 'Margarita']);
  });

  it('solo cuenta lo que sigue en pie tras anular a medias', () => {
    const r = otraRonda([pedido('2026-11-02T21:00:00Z', [item({ id: 'a', quantity: 4 })], {
      voids: [{ item_id: 'a', quantity: 1 }],
    } as unknown as Partial<OrderWithItems>)], CARTA);
    expect(r.lineas[0].quantity).toBe(3);
  });

  it('el tiempo de la comida no se repite; la nota sí', () => {
    const r = otraRonda([pedido('2026-11-02T21:00:00Z', [
      item({ note: 'Primer tiempo · sin hielo' }),
      item({ product_id: 'gal', note: 'Postre' }),
    ])], CARTA);
    expect(r.lineas[0].note).toBe('sin hielo');
    expect(r.lineas[1].note).toBeUndefined();
  });

  it('un artículo libre se repite con su precio escrito', () => {
    const r = otraRonda([pedido('2026-11-02T21:00:00Z', [item({ product_id: null, name_snapshot: 'Descorche', price_snapshot: 50 })])], CARTA);
    expect(r.lineas[0]).toMatchObject({ open: true, name: 'Descorche', price: 50 });
  });

  it('sin rondas enviadas no hay nada que repetir', () => {
    expect(otraRonda([], CARTA)).toEqual({ lineas: [], faltan: [] });
  });
});
