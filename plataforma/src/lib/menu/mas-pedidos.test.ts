import { describe, expect, it } from 'vitest';
import { elegirMasPedidos } from './mas-pedidos';

const p = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe('elegirMasPedidos', () => {
  it('ordena por ventas, numera y calla los números pequeños', () => {
    const r = elegirMasPedidos(
      [{ id: 'a', unidades: 41 }, { id: 'b', unidades: 7 }, { id: 'c', unidades: 2 }],
      [p('a'), p('b'), p('c')],
    );
    expect(r.map((x) => [x.producto.id, x.puesto, x.vendidos])).toEqual([['a', 1, 41], ['b', 2, 7], ['c', 3, null]]);
  });

  it('salta lo agotado y lo que ya no está en la carta', () => {
    const r = elegirMasPedidos(
      [{ id: 'x', unidades: 50 }, { id: 'a', unidades: 30 }, { id: 'b', unidades: 20 }, { id: 'c', unidades: 10 }],
      [p('a', { is_available: false }), p('b'), p('c')],
    );
    expect(r.map((x) => x.producto.id)).toEqual(['b', 'c']);
    expect(r[0].puesto).toBe(1);
  });

  it('no pinta la tira con menos de dos platillos', () => {
    expect(elegirMasPedidos([{ id: 'a', unidades: 9 }], [p('a')])).toEqual([]);
  });

  it('como mucho cuatro', () => {
    const ventas = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, unidades: 10 - i }));
    expect(elegirMasPedidos(ventas, ventas.map((v) => p(v.id)))).toHaveLength(4);
  });
});
