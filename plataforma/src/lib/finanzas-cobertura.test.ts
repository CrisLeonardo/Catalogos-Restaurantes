import { describe, expect, it } from 'vitest';
import { cifrasDeCosto, coberturaDeCostos } from './finanzas-cobertura';

describe('coberturaDeCostos', () => {
  it('sin ventas de platillos: nada que costear', () => {
    expect(coberturaDeCostos({ productRevenue: 0, costedRevenue: 0 })).toEqual({ tipo: 'sin-ventas' });
  });

  it('se vendió y ningún platillo tiene costo: el costo no se conoce (X21)', () => {
    expect(coberturaDeCostos({ productRevenue: 5689.3, costedRevenue: 0 })).toEqual({ tipo: 'sin-costos' });
  });

  it('costos a medias: parcial con el porcentaje de lo vendido (PA-T17: 60 % costeado)', () => {
    expect(coberturaDeCostos({ productRevenue: 1000, costedRevenue: 600 })).toEqual({ tipo: 'parcial', pct: 60 });
  });

  it('casi todo costeado cuenta como completo (mismo umbral que Finanzas del panel)', () => {
    expect(coberturaDeCostos({ productRevenue: 1000, costedRevenue: 960 })).toEqual({ tipo: 'completa' });
  });
});

describe('cifrasDeCosto', () => {
  const base = { productRevenue: 1000, costedRevenue: 0, cost: 0, profit: 0, marginPct: null };

  it('sin costos: costo, utilidad y margen desconocidos, nunca cero', () => {
    expect(cifrasDeCosto(base)).toEqual({ costo: null, utilidad: null, margen: null });
  });

  it('con costos: las cifras tal cual', () => {
    expect(cifrasDeCosto({ ...base, costedRevenue: 600, cost: 300, profit: 300, marginPct: 50 }))
      .toEqual({ costo: 300, utilidad: 300, margen: 50 });
  });

  it('sin ventas: cero de verdad (no se vendió nada)', () => {
    expect(cifrasDeCosto({ ...base, productRevenue: 0 })).toEqual({ costo: 0, utilidad: 0, margen: null });
  });
});
