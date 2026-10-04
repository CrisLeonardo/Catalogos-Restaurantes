/**
 * El dinero se escribe de una sola manera (auditoría 2026-10-02, T-01).
 * Con el locale 'es' de antes, Q1146 salía «Q1146,00».
 */
import { describe, it, expect } from 'vitest';
import { fmtMoney, fmtCurrency } from './money';

describe('fmtMoney', () => {
  it('punto decimal y coma de miles, también en 4 cifras', () => {
    expect(fmtMoney(1146)).toBe('Q1,146.00');
    expect(fmtMoney(2794.1)).toBe('Q2,794.10');
    expect(fmtMoney(698)).toBe('Q698.00');
  });

  it('sin decimales para precios de plan', () => {
    expect(fmtMoney(349, 'GTQ', 0)).toBe('Q349');
    expect(fmtMoney(1499, 'GTQ', 0)).toBe('Q1,499');
  });

  it('otra moneda conocida y una desconocida', () => {
    expect(fmtMoney(12.5, 'USD')).toBe('$12.50');
    expect(fmtMoney(3, 'CRC')).toBe('CRC 3.00');
  });

  it('nunca escribe NaN', () => {
    expect(fmtMoney(Number.NaN)).toBe('Q0.00');
  });
});

/** La moneda que configuró el restaurante (REN-06: eran cuatro copias). */
describe('fmtCurrency', () => {
  it('símbolo delante, con los separadores de su país', () => {
    expect(fmtCurrency(1234.5, { symbol: 'Q', position: 'prefix', locale: 'es-GT' })).toBe('Q1,234.50');
  });

  it('símbolo detrás y sin centavos para el plano', () => {
    expect(fmtCurrency(412, { symbol: ' €', position: 'suffix', locale: 'es-GT' }, 0)).toBe('412 €');
  });

  it('un locale guardado que no existe cae a es-GT en vez de romper', () => {
    expect(fmtCurrency(1146, { symbol: 'Q', position: 'prefix', locale: 'xx_INVALIDO!!' })).toBe('Q1,146.00');
  });
});
