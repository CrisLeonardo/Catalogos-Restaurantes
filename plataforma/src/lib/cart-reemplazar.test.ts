/** «Cambiar» una línea del carrito (auditoría 1.11, M04). */
import { describe, expect, it } from 'vitest';
import { buildLineId, reemplazarLinea } from './cart-context';
import type { CartItem } from '@/types';

const op = (choiceId: string, priceDelta = 0) => ({ groupId: 'a', groupName: 'Acompañamiento', choiceId, choiceName: choiceId, priceDelta });
const linea = (choiceId: string, quantity: number, price = 62): CartItem =>
  ({ productId: 'h', name: 'Hamburguesa', price, image_url: null, options: [op(choiceId)], quantity, lineId: buildLineId('h', [op(choiceId)]) });
const limonada: CartItem = { productId: 'l', name: 'Limonada', price: 18, image_url: null, quantity: 2, lineId: 'l' };

describe('reemplazarLinea', () => {
  it('cambia la línea en su lugar, con su nueva cantidad y precio', () => {
    const antes = [linea('papas', 1), limonada];
    const despues = reemplazarLinea(antes, antes[0].lineId, { productId: 'h', name: 'Hamburguesa', price: 70, image_url: null, options: [op('aros', 8)] }, 2);
    expect(despues.map((x) => [x.lineId, x.quantity, x.price])).toEqual([[buildLineId('h', [op('aros', 8)]), 2, 70], ['l', 2, 18]]);
  });
  it('si queda igual a otra línea, se juntan', () => {
    const antes = [linea('papas', 1), linea('ensalada', 3)];
    const despues = reemplazarLinea(antes, antes[0].lineId, { productId: 'h', name: 'Hamburguesa', price: 62, image_url: null, options: [op('ensalada')] }, 1);
    expect(despues).toHaveLength(1);
    expect(despues[0].quantity).toBe(4);
  });
});
