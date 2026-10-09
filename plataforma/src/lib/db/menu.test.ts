import { describe, expect, it, vi } from 'vitest';

// menu.ts importa los clientes de Supabase (cookies de Next); aquí solo se
// prueba la función pura que decide qué existencias salen al navegador.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

import { withStockLeft } from './menu';

const productos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const existencias = { a: 3, b: 12 };

describe('withStockLeft («Quedan pocas»)', () => {
  it('apagado: el inventario no sale del servidor', () => {
    const out = withStockLeft(productos, existencias, { showStockLeft: false, stockLeftBelow: 10 });
    expect(out.every((p) => !('stock_left' in p))).toBe(true);
  });

  it('encendido: solo los que bajan del umbral llevan el número', () => {
    const out = withStockLeft(productos, existencias, { showStockLeft: true, stockLeftBelow: 10 });
    expect(out).toEqual([{ id: 'a', stock_left: 3 }, { id: 'b' }, { id: 'c' }]);
  });

  it('vista previa: manda todas las existencias bajas aunque esté apagado', () => {
    const out = withStockLeft(productos, existencias, { showStockLeft: false, stockLeftBelow: 10 }, true);
    expect(out).toEqual([{ id: 'a', stock_left: 3 }, { id: 'b', stock_left: 12 }, { id: 'c' }]);
  });

  it('tolera una entrada vieja de la caché sin existencias', () => {
    const out = withStockLeft(productos, undefined, { showStockLeft: true, stockLeftBelow: 10 });
    expect(out).toEqual(productos);
  });
});
