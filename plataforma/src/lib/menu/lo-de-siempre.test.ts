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
