import { describe, expect, it } from 'vitest';
import { construirPricingSettings, currentPeriod, isOverdue, type Invoice } from './billing';

const BASE_INVOICE: Invoice = {
  id: 'inv1',
  restaurant_id: 'r1',
  concept: 'MONTHLY',
  description: null,
  period: '2026-08-01',
  amount: 599,
  currency: 'GTQ',
  status: 'PENDING',
  due_date: '2026-08-10',
  paid_at: null,
  paid_amount: null,
  payment_method: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
};

describe('isOverdue', () => {
  it('no está vencida antes de la fecha límite', () => {
    expect(isOverdue(BASE_INVOICE, new Date('2026-08-09T00:00:00Z'))).toBe(false);
  });

  it('está vencida después de la fecha límite', () => {
    expect(isOverdue(BASE_INVOICE, new Date('2026-08-11T00:00:00Z'))).toBe(true);
  });

  it('una factura ya pagada nunca está vencida, aunque pasó la fecha', () => {
    expect(isOverdue({ ...BASE_INVOICE, status: 'PAID' }, new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });

  it('una factura cancelada nunca está vencida', () => {
    expect(isOverdue({ ...BASE_INVOICE, status: 'CANCELLED' }, new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });

  it('sin due_date no se puede considerar vencida', () => {
    expect(isOverdue({ ...BASE_INVOICE, due_date: null }, new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });
});

describe('currentPeriod', () => {
  it('devuelve el primer día del mes en UTC', () => {
    expect(currentPeriod(new Date('2026-08-15T23:00:00Z'))).toBe('2026-08-01');
  });

  it('rellena el mes con cero a la izquierda', () => {
    expect(currentPeriod(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-01');
  });
});

describe('construirPricingSettings', () => {
  it('toma los precios guardados y deja de fábrica lo que falte', () => {
    const s = construirPricingSettings(new Map([['plan_price_ESTANDAR', '150'], ['plan_price_PREMIUM', '299'], ['trial_days', '0']]));
    expect(s.estandar).toBe(150);
    expect(s.premium).toBe(299);
    expect(s.enLinea).toBe(99);
    expect(s.trialDays).toBe(0);
  });

  it('un valor ilegible no se convierte en 0: queda el de fábrica', () => {
    expect(construirPricingSettings(new Map([['plan_price_EN_LINEA', 'abc']])).enLinea).toBe(99);
  });
});
