import { describe, expect, it } from 'vitest';
import { buildSalesReport, type RawSalesReport } from './reports';

const EMPTY_RAW: RawSalesReport = {
  orders: 0, revenue: 0, productRevenue: 0, deliveryRevenue: 0, cost: 0, costedRevenue: 0,
  series: [], byChannel: [], byPayment: [], byZone: [], topByRevenue: [], topByProfit: [],
};

describe('buildSalesReport', () => {
  it('un reporte vacío no revienta y no calcula margen (costedRevenue 0)', () => {
    const r = buildSalesReport('2026-08-01', '2026-08-01', EMPTY_RAW);
    expect(r.orders).toBe(0);
    expect(r.avgTicket).toBe(0);
    expect(r.marginPct).toBeNull();
  });

  it('deriva profit y marginPct de costedRevenue - cost', () => {
    const raw: RawSalesReport = {
      ...EMPTY_RAW, orders: 10, revenue: 1000, costedRevenue: 800, cost: 500,
    };
    const r = buildSalesReport('2026-08-01', '2026-08-07', raw);
    expect(r.profit).toBe(300);
    // 300 / 800 * 100 = 37.5%
    expect(r.marginPct).toBeCloseTo(37.5);
  });

  it('avgTicket es revenue / orders', () => {
    const raw: RawSalesReport = { ...EMPTY_RAW, orders: 4, revenue: 200 };
    expect(buildSalesReport('2026-08-01', '2026-08-01', raw).avgTicket).toBe(50);
  });

  it('traduce las etiquetas de canal conocidas y deja pasar las desconocidas', () => {
    const raw: RawSalesReport = {
      ...EMPTY_RAW,
      byChannel: [
        { key: 'DINE_IN', orders: 1, revenue: 100 },
        { key: 'ALGO_NUEVO', orders: 1, revenue: 50 },
      ],
    };
    const r = buildSalesReport('2026-08-01', '2026-08-01', raw);
    expect(r.byChannel.find((c) => c.key === 'DINE_IN')?.label).toBe('En el local');
    expect(r.byChannel.find((c) => c.key === 'ALGO_NUEVO')?.label).toBe('ALGO_NUEVO');
  });

  it('CASH se muestra como "Efectivo", otros métodos pasan tal cual', () => {
    const raw: RawSalesReport = {
      ...EMPTY_RAW,
      byPayment: [
        { key: 'CASH', orders: 1, revenue: 100 },
        { key: 'TARJETA', orders: 1, revenue: 200 },
      ],
    };
    const r = buildSalesReport('2026-08-01', '2026-08-01', raw);
    expect(r.byPayment.find((p) => p.key === 'CASH')?.label).toBe('Efectivo');
    expect(r.byPayment.find((p) => p.key === 'TARJETA')?.label).toBe('TARJETA');
  });

  it('formatea la etiqueta de cada día de la serie a partir de la fecha', () => {
    const raw: RawSalesReport = {
      ...EMPTY_RAW,
      series: [{ date: '2026-08-15', orders: 2, revenue: 300 }],
    };
    const r = buildSalesReport('2026-08-15', '2026-08-15', raw);
    expect(r.series).toHaveLength(1);
    expect(r.series[0].date).toBe('2026-08-15');
    expect(r.series[0].label.length).toBeGreaterThan(0);
  });

  it('conserva productos con y sin costo capturado (hasCost) en los tops', () => {
    const raw: RawSalesReport = {
      ...EMPTY_RAW,
      topByRevenue: [
        { name: 'Con costo', qty: 5, revenue: 100, cost: 40, profit: 60, hasCost: true },
        { name: 'Sin costo', qty: 3, revenue: 90, cost: 0, profit: 0, hasCost: false },
      ],
    };
    const r = buildSalesReport('2026-08-01', '2026-08-01', raw);
    expect(r.topByRevenue).toHaveLength(2);
    expect(r.topByRevenue[1].hasCost).toBe(false);
  });

  it('no revienta si el jsonb del RPC llega con arreglos ausentes', () => {
    const raw = { orders: 1, revenue: 10 } as unknown as RawSalesReport;
    const r = buildSalesReport('2026-08-01', '2026-08-01', raw);
    expect(r.series).toEqual([]);
    expect(r.byChannel).toEqual([]);
    expect(r.topByProfit).toEqual([]);
  });
});
