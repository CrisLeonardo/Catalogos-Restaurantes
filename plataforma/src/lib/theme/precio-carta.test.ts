import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './defaults';
import { formatPrice, formatPriceCarta } from './resolve';

// CV-18: en la carta «Q52», no «Q52.00»; los centavos se dicen cuando existen.
describe('formatPriceCarta', () => {
  const cfg = { ...DEFAULT_CONFIG, currencySymbol: 'Q', currencyPosition: 'prefix' as const, locale: 'es-GT' };

  it('sin centavos no pinta .00', () => {
    expect(formatPriceCarta(52, cfg)).toBe('Q52');
    expect(formatPriceCarta(1250, cfg)).toBe('Q1,250');
  });

  it('con centavos los conserva', () => {
    expect(formatPriceCarta(52.5, cfg)).toBe('Q52.50');
  });

  it('los totales siguen con centavos', () => {
    expect(formatPrice(52, cfg)).toBe('Q52.00');
  });
});
