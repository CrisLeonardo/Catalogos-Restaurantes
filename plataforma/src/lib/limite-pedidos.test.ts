import { describe, expect, it } from 'vitest';
import { cubosDelPedido, PEDIDOS_POR_IP, PEDIDOS_POR_TELEFONO } from './limite-pedidos';

describe('límite de pedidos del público', () => {
  it('el wifi del local aguanta más que una persona', () => {
    expect(PEDIDOS_POR_IP).toBeGreaterThan(PEDIDOS_POR_TELEFONO);
  });

  it('cuenta por IP y por teléfono, cada uno en su local', () => {
    expect(cubosDelPedido('1.2.3.4', 'local-a', '5555-1234')).toEqual([
      { clave: 'order:1.2.3.4:local-a', max: 30, ventanaMs: 60_000 },
      { clave: 'order-tel:local-a:55551234', max: 6, ventanaMs: 60_000 },
    ]);
  });

  it('el mismo teléfono con o sin código de país es la misma persona', () => {
    const [, a] = cubosDelPedido('ip', 'l', '+502 5555-1234');
    const [, b] = cubosDelPedido('ip', 'l', '55551234');
    expect(a.clave).toBe(b.clave);
  });

  it('sin teléfono (la mesa compartida) solo cuenta la IP', () => {
    expect(cubosDelPedido('ip', 'l', '')).toHaveLength(1);
    expect(cubosDelPedido('ip', 'l', undefined)).toHaveLength(1);
  });
});
