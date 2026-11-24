import { afterEach, describe, expect, it } from 'vitest';
import { causaNoGuardado, getQueuedOrders, pedidoParaRetomar, removeQueuedOrder, saveQueuedOrder } from './order-queue';
import { noSeEnvio } from '@/components/checkout/checkout-model';

/** localStorage de mentira: guarda en memoria y puede fallar a voluntad. */
function almacen(falla?: () => Error, mudo = false) {
  const datos = new Map<string, string>();
  const s = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (falla) throw falla();
      if (!mudo) datos.set(k, v);
    },
    removeItem: (k: string) => { datos.delete(k); },
  };
  (globalThis as { localStorage?: unknown }).localStorage = s;
  return datos;
}

function cuota() {
  const e = new Error('quota');
  e.name = 'QuotaExceededError';
  return e;
}

const pedido = (clientId: string) => ({ clientId, payload: { a: 1 }, queuedAt: '2026-11-04T12:00:00Z' });

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('cola de pedidos del aparato (auditoría 0.11)', () => {
  it('guarda, reemplaza por clientId y quita', () => {
    almacen();
    expect(saveQueuedOrder('r1', pedido('a'))).toEqual({ ok: true });
    expect(saveQueuedOrder('r1', { ...pedido('a'), total: 50 })).toEqual({ ok: true });
    expect(saveQueuedOrder('r1', pedido('b'))).toEqual({ ok: true });
    expect(getQueuedOrders('r1').map((o) => o.clientId)).toEqual(['b', 'a']);
    removeQueuedOrder('r1', 'a');
    removeQueuedOrder('r1', 'b');
    expect(getQueuedOrders('r1')).toEqual([]);
  });

  it('la del mesero no se mezcla con la del comensal', () => {
    almacen();
    saveQueuedOrder('r1', pedido('m'), 'waiter');
    expect(getQueuedOrders('r1')).toEqual([]);
    expect(getQueuedOrders('r1', 'waiter')).toHaveLength(1);
  });

  it('con la memoria llena dice que NO se guardó', () => {
    almacen(cuota);
    expect(saveQueuedOrder('r1', pedido('a'))).toEqual({ ok: false, motivo: 'lleno' });
  });

  it('con el almacenamiento bloqueado dice que NO se guardó', () => {
    almacen(() => { const e = new Error('denied'); e.name = 'SecurityError'; return e; });
    expect(saveQueuedOrder('r1', pedido('a'))).toEqual({ ok: false, motivo: 'bloqueado' });
  });

  it('sin localStorage dice que NO se guardó', () => {
    expect(saveQueuedOrder('r1', pedido('a'))).toEqual({ ok: false, motivo: 'bloqueado' });
  });

  it('si la escritura no falla pero no queda nada, tampoco cuenta como guardado', () => {
    almacen(undefined, true);
    expect(saveQueuedOrder('r1', pedido('a'))).toEqual({ ok: false, motivo: 'bloqueado' });
  });

  it('explica la causa', () => {
    expect(causaNoGuardado('lleno')).toMatch(/llena/);
    expect(causaNoGuardado('bloqueado')).toMatch(/no deja guardar/);
  });
});

describe('pedido en espera al volver (LZ-02)', () => {
  const q = (clientId: string, queuedAt: string, snapshot?: unknown) => ({ clientId, payload: {}, queuedAt, snapshot });

  it('retoma el más reciente que trae su resumen', () => {
    const lista = [
      q('viejo', '2026-11-24T10:00:00Z', { totalSnapshot: 10 }),
      q('nuevo', '2026-11-24T11:00:00Z', { totalSnapshot: 20 }),
      q('sin-resumen', '2026-11-24T12:00:00Z'),
    ];
    expect(pedidoParaRetomar(lista)?.clientId).toBe('nuevo');
  });

  it('los de antes, sin resumen, no se retoman en pantalla', () => {
    expect(pedidoParaRetomar([q('a', '2026-11-24T10:00:00Z')])).toBeNull();
    expect(pedidoParaRetomar([])).toBeNull();
  });

  it('si el local lo rechaza, dice que no salió y por qué', () => {
    expect(noSeEnvio('Los pedidos están pausados por el momento. Intenta más tarde.'))
      .toBe('Tu pedido no se envió: los pedidos están pausados por el momento. Intenta más tarde.');
    expect(noSeEnvio('')).toBe('Tu pedido no se envió.');
  });
});
