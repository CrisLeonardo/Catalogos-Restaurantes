import { describe, expect, it } from 'vitest';
import { rearmarPedido } from './lo-de-siempre';

const grupo = { id: 'g1', name: 'Término', type: 'single' as const, choices: [{ id: 'c1', name: 'Tres cuartos', priceDelta: 0 }, { id: 'c2', name: 'Doble queso', priceDelta: 8 }] };

describe('rearmarPedido', () => {
  it('usa el precio de hoy, no el guardado', () => {
    const r = rearmarPedido([{ productId: 'a', quantity: 2 }], [{ id: 'a', name: 'Papas', price: 38 }]);
    expect(r.lineas[0].item.price).toBe(38);
    expect(r.total).toBe(76);
    expect(r.faltan).toBe(0);
  });

  it('suma lo que hoy cuesta cada opción', () => {
    const r = rearmarPedido(
      [{ productId: 'b', quantity: 1, options: [{ groupId: 'g1', choiceId: 'c2' }] }],
      [{ id: 'b', name: 'Clásica', price: 52, options: [grupo] }],
    );
    expect(r.lineas[0].item.price).toBe(60);
    expect(r.lineas[0].item.options?.[0].choiceName).toBe('Doble queso');
  });

  it('salta lo agotado, lo retirado y lo que cambió de opciones', () => {
    const r = rearmarPedido(
      [
        { productId: 'x', quantity: 1 },
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 1, options: [{ groupId: 'g1', choiceId: 'zz' }] },
        { productId: 'c', quantity: 1 },
      ],
      [{ id: 'a', name: 'A', price: 10, is_available: false }, { id: 'b', name: 'B', price: 10, options: [grupo] }, { id: 'c', name: 'C', price: 15 }],
    );
    expect(r.lineas.map((l) => l.item.productId)).toEqual(['c']);
    expect(r.faltan).toBe(3);
  });
});

describe('leerUltimoPedido', () => {
  it('no ofrece «lo de siempre» recién pedido ni pasados 90 días', async () => {
    const { guardarUltimoPedido, leerUltimoPedido, RECIENTE_MS } = await import('./lo-de-siempre');
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
    } as Storage;
    guardarUltimoPedido('r1', [{ lineId: 'l', productId: 'a', name: 'A', price: 10, quantity: 1, image_url: null }]);
    const ahora = Date.now();
    expect(leerUltimoPedido('r1', ahora + 60_000)).toBeNull();
    expect(leerUltimoPedido('r1', ahora + RECIENTE_MS + 60_000)).toHaveLength(1);
    expect(leerUltimoPedido('r1', ahora + 91 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
