import { describe, expect, it } from 'vitest';
import { computeTip, tipAppliesToType } from './resolve';
import { DEFAULT_CONFIG } from './defaults';
import type { ThemeConfig } from './defaults';

/** Config base con propina obligatoria del 10% activa para DINE_IN. */
const TIP_CONFIG: ThemeConfig = {
  ...DEFAULT_CONFIG,
  tipEnabled: true,
  tipPercent: 10,
  tipOrderTypes: ['dine_in'],
};

describe('tipAppliesToType', () => {
  it('aplica cuando el tipo de pedido está en tipOrderTypes', () => {
    expect(tipAppliesToType(TIP_CONFIG, 'DINE_IN')).toBe(true);
  });

  it('no aplica a un tipo de pedido fuera de tipOrderTypes', () => {
    expect(tipAppliesToType(TIP_CONFIG, 'DELIVERY')).toBe(false);
  });

  it('no aplica si tipEnabled es false, aunque el tipo esté en la lista', () => {
    expect(tipAppliesToType({ ...TIP_CONFIG, tipEnabled: false }, 'DINE_IN')).toBe(false);
  });

  it('no aplica si tipPercent es 0 o negativo', () => {
    expect(tipAppliesToType({ ...TIP_CONFIG, tipPercent: 0 }, 'DINE_IN')).toBe(false);
    expect(tipAppliesToType({ ...TIP_CONFIG, tipPercent: -5 }, 'DINE_IN')).toBe(false);
  });
});

describe('computeTip', () => {
  it('devuelve 0 si el cliente no aceptó la propina', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', false, 100)).toBe(0);
  });

  it('devuelve 0 si el tipo de pedido no tiene propina obligatoria', () => {
    expect(computeTip(TIP_CONFIG, 'DELIVERY', true, 100)).toBe(0);
  });

  it('calcula el porcentaje exacto sobre el subtotal', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 100)).toBe(10);
    expect(computeTip({ ...TIP_CONFIG, tipPercent: 12.5 }, 'DINE_IN', true, 10)).toBe(1.25);
  });

  it('redondea al centavo más cercano en subtotales con decimales', () => {
    // 33.33 * 10% = 3.333 → redondea a 3.33 (dos decimales de moneda).
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 33.33)).toBe(3.33);
  });

  it('nunca calcula propina sobre subtotal 0', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 0)).toBe(0);
  });
});
