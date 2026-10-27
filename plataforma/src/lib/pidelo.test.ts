import { describe, expect, it } from 'vitest';
import {
  MAX_LINEAS, canalDeSala, limpiarPedido, nuevaSala, pedidoDesdeCarrito, salaValida,
} from './pidelo';
import type { CartItem } from '@/types';

const item = (over: Partial<CartItem> = {}): CartItem => ({
  lineId: 'a', productId: 'a', name: 'Rincón Clásica', price: 52, quantity: 2, image_url: null, ...over,
});

describe('sala', () => {
  it('genera 8 caracteres que pasan la validación', () => {
    for (let i = 0; i < 50; i++) expect(salaValida(nuevaSala())).not.toBeNull();
  });

  it('no usa caracteres que se confunden', () => {
    const sala = nuevaSala(() => new Uint8Array(8).map((_, i) => i * 31));
    expect(sala).not.toMatch(/[01ilo]/);
  });

  it('rechaza lo que no tiene forma de sala', () => {
    expect(salaValida(null)).toBeNull();
    expect(salaValida('')).toBeNull();
    expect(salaValida('abc')).toBeNull();
    expect(salaValida('ABCDEFGH')).toBeNull();
    expect(salaValida('abcd efg')).toBeNull();
    expect(salaValida('abcdefgh')).toBe('abcdefgh');
  });

  it('el canal lleva la sala', () => {
    expect(canalDeSala('abcdefgh')).toBe('pidelo:abcdefgh');
  });
});

describe('pedidoDesdeCarrito', () => {
  it('arma líneas con las opciones y el total', () => {
    const p = pedidoDesdeCarrito([
      item({
        options: [
          { groupId: 'g', groupName: 'Término', choiceId: 'm', choiceName: 'Término medio', priceDelta: 0 },
          { groupId: 'e', groupName: 'Extras', choiceId: 't', choiceName: 'Tocino', priceDelta: 10 },
        ],
        price: 62,
      }),
      item({ lineId: 'b', productId: 'b', name: 'Malteada', price: 30, quantity: 1 }),
    ], '  Cris  ', 1000);
    expect(p).toEqual({
      cliente: 'Cris',
      lineas: [
        { nombre: 'Rincón Clásica', cantidad: 2, detalle: 'Término medio · Tocino' },
        { nombre: 'Malteada', cantidad: 1, detalle: '' },
      ],
      total: 154,
      enviado: 1000,
    });
  });
});

describe('limpiarPedido', () => {
  const ahora = 1_000_000;

  it('acepta un pedido bien formado', () => {
    const p = { cliente: 'Ana', lineas: [{ nombre: 'Pizza', cantidad: 1, detalle: '' }], total: 85, enviado: ahora - 2000 };
    expect(limpiarPedido(p, ahora)).toEqual(p);
  });

  it('descarta lo que no es un pedido', () => {
    expect(limpiarPedido(null, ahora)).toBeNull();
    expect(limpiarPedido('hola', ahora)).toBeNull();
    expect(limpiarPedido({ lineas: 'x' }, ahora)).toBeNull();
    expect(limpiarPedido({ lineas: [{ nombre: '' }, 3, null] }, ahora)).toBeNull();
  });

  it('recorta textos, cantidades y número de líneas', () => {
    const p = limpiarPedido({
      cliente: 'x'.repeat(200),
      lineas: Array.from({ length: 40 }, () => ({ nombre: 'y'.repeat(200), cantidad: 9999, detalle: 'z\n\n'.repeat(80) })),
      total: 1e12,
    }, ahora)!;
    expect(p.cliente).toHaveLength(24);
    expect(p.lineas).toHaveLength(MAX_LINEAS);
    expect(p.lineas[0].nombre).toHaveLength(40);
    expect(p.lineas[0].cantidad).toBe(20);
    expect(p.lineas[0].detalle.length).toBeLessThanOrEqual(60);
    expect(p.lineas[0].detalle).not.toMatch(/\n/);
    expect(p.total).toBe(99_999);
  });

  it('no se cree la hora del otro aparato si es rara', () => {
    const base = { lineas: [{ nombre: 'Pizza', cantidad: 1 }] };
    expect(limpiarPedido({ ...base, enviado: ahora + 5000 }, ahora)!.enviado).toBe(ahora);
    expect(limpiarPedido({ ...base, enviado: ahora - 3_600_000 }, ahora)!.enviado).toBe(ahora);
    expect(limpiarPedido({ ...base, enviado: 'ayer' }, ahora)!.enviado).toBe(ahora);
  });

  it('un total raro queda en cero', () => {
    const base = { lineas: [{ nombre: 'Pizza', cantidad: 1 }] };
    expect(limpiarPedido({ ...base, total: -5 }, ahora)!.total).toBe(0);
    expect(limpiarPedido({ ...base, total: 'mucho' }, ahora)!.total).toBe(0);
  });
});
