import { describe, it, expect } from 'vitest';
import { groupTableLines } from './table-lines';
import type { OrderWithItems } from './db/orders';

type ItemStub = {
  id: string; name_snapshot: string; quantity: number; price_snapshot: number; subtotal: number;
  options_snapshot?: { choice: string }[];
  note?: string;
};

function item(id: string, name: string, quantity: number, price = 100): ItemStub {
  return { id, name_snapshot: name, quantity, price_snapshot: price, subtotal: quantity * price };
}

function pedido(status: string, items: ItemStub[], voids: unknown[] = []) {
  return { status, items, voids } as unknown as OrderWithItems;
}

describe('groupTableLines', () => {
  it('junta el mismo plato de dos comandas distintas si va igual', () => {
    const lines = groupTableLines([
      pedido('PREP', [item('a', 'Carne asada', 2)]),
      pedido('PREP', [item('b', 'Carne asada', 1)]),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 3, name: 'Carne asada', estado: 'En cocina' });
  });

  it('NO junta el mismo plato si uno ya se sirvió y otro sigue en cocina', () => {
    // Para el mesero es justo la diferencia que importa: qué falta traer.
    const lines = groupTableLines([
      pedido('PREP', [item('a', 'Carne asada', 2)]),
      pedido('SERVED', [item('b', 'Carne asada', 1)]),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => `${l.qty} ${l.estado}`).sort())
      .toEqual(['1 Servido', '2 En cocina']);
  });

  it('descuenta las unidades anuladas', () => {
    const lines = groupTableLines([
      pedido('PREP', [item('a', 'Limonada', 3)], [{ item_id: 'a', quantity: 1 }]),
    ]);
    expect(lines[0].qty).toBe(2);
  });

  it('una línea anulada entera desaparece en vez de salir como 0×', () => {
    const lines = groupTableLines([
      pedido('PREP', [item('a', 'Limonada', 2)], [{ item_id: 'a', quantity: 2 }]),
    ]);
    expect(lines).toHaveLength(0);
  });

  it('ignora las comandas anuladas completas', () => {
    const lines = groupTableLines([
      pedido('CANCEL', [item('a', 'Carne asada', 5)]),
      pedido('PREP', [item('b', 'Sopa', 1)]),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Sopa');
  });

  it('pinta cada estado con su color: verde servido, acento listo, ámbar cocina', () => {
    const [servido] = groupTableLines([pedido('SERVED', [item('a', 'X', 1)])]);
    const [listo] = groupTableLines([pedido('READY', [item('a', 'X', 1)])]);
    const [cocina] = groupTableLines([pedido('PREP', [item('a', 'X', 1)])]);
    expect(servido.color).toBe('var(--c-ok)');
    expect(listo.color).toBe('var(--brand-accent-ink)');
    expect(cocina.color).toBe('var(--c-warn)');
  });

  it('cada renglón lleva lo que suman sus unidades', () => {
    const [linea] = groupTableLines([pedido('PREP', [item('a', 'Carne asada', 2, 105)])]);
    expect(linea.qty).toBe(2);
    expect(linea.amount).toBe(210);
  });

  it('el importe también se junta al fundir dos comandas', () => {
    // Mismo plato, mismo estado, dos comandas: un renglón y un solo importe.
    const [linea] = groupTableLines([
      pedido('PREP', [item('a', 'Limonada', 2, 18)]),
      pedido('PREP', [item('b', 'Limonada', 1, 18)]),
    ]);
    expect(linea.qty).toBe(3);
    expect(linea.amount).toBe(54);
  });

  it('lo anulado no se cobra: el importe baja con las unidades', () => {
    const [linea] = groupTableLines([
      pedido('PREP', [item('a', 'Carne asada', 3, 105)], [{ item_id: 'a', quantity: 1 }]),
    ]);
    expect(linea.qty).toBe(2);
    expect(linea.amount).toBe(210);
  });

  it('una mesa sin comandas no revienta', () => {
    expect(groupTableLines([])).toEqual([]);
  });

  it('NO junta el mismo plato si uno se pidió con opciones distintas', () => {
    // Dos carnes asadas no son lo mismo si una va sin cebolla: quien las
    // lleva a la mesa necesita saber cuál es cuál.
    const lines = groupTableLines([
      pedido('PREP', [
        { ...item('a', 'Carne asada', 2), options_snapshot: [{ choice: 'Término medio' }] },
        { ...item('b', 'Carne asada', 1), options_snapshot: [{ choice: 'Bien cocida' }], note: 'sin cebolla' },
      ]),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.detalle).sort())
      .toEqual(['Bien cocida · sin cebolla', 'Término medio']);
  });

  it('un plato pedido tal cual no arrastra detalle', () => {
    const lines = groupTableLines([pedido('PREP', [item('a', 'Sopa', 1)])]);
    expect(lines[0].detalle).toBe('');
  });
});
