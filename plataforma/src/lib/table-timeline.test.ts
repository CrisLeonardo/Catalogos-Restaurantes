import { describe, it, expect } from 'vitest';
import { tableTimeline } from './table-timeline';
import type { OrderWithItems } from './db/orders';

function item(id: string, name: string, quantity: number) {
  return { id, name_snapshot: name, quantity, price_snapshot: 100, subtotal: quantity * 100 };
}

function pedido(o: {
  status?: string;
  created_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  served_at?: string | null;
  waiter_name?: string | null;
  items?: ReturnType<typeof item>[];
  voids?: unknown[];
}) {
  return {
    status: 'PREP',
    accepted_at: null, ready_at: null, served_at: null, waiter_name: null,
    items: [], voids: [],
    ...o,
  } as unknown as OrderWithItems;
}

describe('tableTimeline', () => {
  it('la primera comanda abre la mesa y las siguientes solo añaden', () => {
    const t = tableTimeline([
      pedido({ created_at: '2026-08-26T12:07:00Z', items: [item('a', 'Sopa', 3)] }),
      pedido({ created_at: '2026-08-26T12:40:00Z', items: [item('b', 'Café', 2)] }),
    ]);
    expect(t.map((e) => e.text)).toEqual([
      'Se abrió la mesa · 3 platos a cocina',
      '2 platos más a cocina',
    ]);
  });

  it('ordena por hora aunque los pedidos vengan al revés', () => {
    const t = tableTimeline([
      pedido({ created_at: '2026-08-26T12:40:00Z', items: [item('b', 'Café', 1)] }),
      pedido({ created_at: '2026-08-26T12:07:00Z', items: [item('a', 'Sopa', 1)] }),
    ]);
    expect(t[0].text).toBe('Se abrió la mesa · 1 plato a cocina');
  });

  it('recorre las cuatro marcas de tiempo de una comanda servida', () => {
    const t = tableTimeline([pedido({
      status: 'SERVED',
      created_at: '2026-08-26T12:07:00Z',
      accepted_at: '2026-08-26T12:09:00Z',
      ready_at: '2026-08-26T12:21:00Z',
      served_at: '2026-08-26T12:26:00Z',
      waiter_name: 'Carlos',
      items: [item('a', 'Sopa', 2)],
    })]);
    expect(t.map((e) => e.text)).toEqual([
      'Se abrió la mesa · 2 platos a cocina',
      'Cocina aceptó la comanda',
      '2 platos listos',
      '2 platos servidos en la mesa',
    ]);
    expect(t[0].who).toBe('Carlos');
    expect(t.some((e) => e.pendiente)).toBe(false);
  });

  it('marca como pendiente lo que está listo y nadie ha llevado', () => {
    const t = tableTimeline([pedido({
      status: 'READY',
      created_at: '2026-08-26T12:07:00Z',
      ready_at: '2026-08-26T12:21:00Z',
      items: [item('a', 'Pizza', 1)],
    })]);
    const listo = t.find((e) => e.text.includes('listo'));
    expect(listo).toMatchObject({ text: '1 plato listo en la barra', pendiente: true });
  });

  it('marca como pendiente la comanda que cocina no ha aceptado', () => {
    const t = tableTimeline([pedido({
      status: 'NEW',
      created_at: '2026-08-26T12:07:00Z',
      items: [item('a', 'Pizza', 1)],
    })]);
    expect(t[0].pendiente).toBe(true);
  });

  it('no cuenta las unidades anuladas en el número de platos', () => {
    const t = tableTimeline([pedido({
      created_at: '2026-08-26T12:07:00Z',
      items: [item('a', 'Limonada', 3)],
      voids: [{ item_id: 'a', quantity: 1, reason: 'Se equivocó', created_at: '2026-08-26T12:10:00Z' }],
    })]);
    expect(t[0].text).toBe('Se abrió la mesa · 2 platos a cocina');
  });

  it('la anulación es un hecho más del turno, en su hora', () => {
    const t = tableTimeline([pedido({
      created_at: '2026-08-26T12:07:00Z',
      accepted_at: '2026-08-26T12:30:00Z',
      items: [item('a', 'Limonada', 3)],
      voids: [{ item_id: 'a', quantity: 1, reason: 'Se equivocó', created_at: '2026-08-26T12:10:00Z' }],
    })]);
    expect(t.map((e) => e.text)).toEqual([
      'Se abrió la mesa · 2 platos a cocina',
      'Se anuló 1 · Limonada · Se equivocó',
      'Cocina aceptó la comanda',
    ]);
  });

  it('la anulación dice quién la hizo, aunque ya no esté en el equipo', () => {
    const t = tableTimeline([pedido({
      created_at: '2026-08-26T12:07:00Z',
      items: [item('a', 'Limonada', 3)],
      voids: [
        { item_id: 'a', quantity: 1, reason: 'Se equivocó', created_at: '2026-08-26T12:10:00Z', requested_by: null, requested_by_name: 'Ana' },
        { item_id: 'a', quantity: 1, reason: 'Sin nombre', created_at: '2026-08-26T12:11:00Z' },
      ],
    })]);
    expect(t.filter((e) => e.text.startsWith('Se anuló')).map((e) => e.who)).toEqual(['Ana', null]);
  });

  it('deja fuera la comanda cancelada entera', () => {
    const t = tableTimeline([
      pedido({ status: 'CANCEL', created_at: '2026-08-26T12:07:00Z', items: [item('a', 'Sopa', 1)] }),
      pedido({ created_at: '2026-08-26T12:40:00Z', items: [item('b', 'Café', 1)] }),
    ]);
    expect(t.map((e) => e.text)).toEqual(['Se abrió la mesa · 1 plato a cocina']);
  });

  it('una mesa sin nada no inventa historia', () => {
    expect(tableTimeline([])).toEqual([]);
  });
});
