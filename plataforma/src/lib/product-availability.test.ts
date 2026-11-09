/**
 * ¿Se puede pedir? (auditoría 2026-10-02, CAT-01)
 *
 * La regla se usa en el menú, en el servidor al validar un pedido, en la
 * lista de Platillos y en Tomar pedidos. Si estos casos cambian, cambian
 * los cuatro a la vez — que es justo lo que se busca.
 */
import { describe, it, expect } from 'vitest';
import {
  cuandoVuelveTexto,
  isAutoRestored,
  isOutOfStock,
  isUnavailable,
  razonDeAgotado,
  withEffectiveAvailability,
} from './product-availability';

const AHORA = Date.parse('2026-10-02T18:00:00Z');
const en = (ms: number) => new Date(AHORA + ms).toISOString();
const HORA = 60 * 60_000;

describe('isUnavailable (auditoría 1.10: agotado con intención)', () => {
  it('disponible es disponible', () => {
    expect(isUnavailable({ is_available: true }, AHORA)).toBe(false);
  });

  it('«hasta mañana» sigue agotado hasta su hora y luego vuelve', () => {
    const p = { is_available: false, agotado_motivo: 'manana', vuelve_at: en(2 * HORA) };
    expect(isUnavailable(p, AHORA)).toBe(true);
    expect(isUnavailable(p, AHORA + 2 * HORA)).toBe(false);
    expect(isAutoRestored(p, AHORA + 2 * HORA)).toBe(true);
  });

  it('ya no hay reloj de 12 h: sin `vuelve_at` no vuelve solo', () => {
    const p = { is_available: false, agotado_motivo: 'manual', unavailable_at: new Date(AHORA - 48 * HORA).toISOString(), vuelve_at: null };
    expect(isUnavailable(p, AHORA)).toBe(true);
  });

  it('sin existencias manda sobre la hora de vuelta', () => {
    const p = { is_available: false, vuelve_at: en(-HORA), track_stock: true, stock: 0 };
    expect(isUnavailable(p, AHORA)).toBe(true);
    expect(isAutoRestored(p, AHORA)).toBe(false);
  });

  it('sin existencias aunque la columna diga disponible', () => {
    expect(isUnavailable({ is_available: true, track_stock: true, stock: 0 }, AHORA)).toBe(true);
  });

  it('stock nulo con control de inventario cuenta como cero (igual que place_order)', () => {
    expect(isOutOfStock({ track_stock: true, stock: null })).toBe(true);
  });

  it('sin control de inventario el stock no importa', () => {
    expect(isUnavailable({ is_available: true, track_stock: false, stock: 0 }, AHORA)).toBe(false);
  });
});

describe('cuándo vuelve, en palabras', () => {
  // 18:00 UTC = 12:00 en Guatemala.
  it('mañana a la hora de corte', () => {
    expect(cuandoVuelveTexto('2026-10-03T11:00:00Z', 'America/Guatemala', AHORA)).toBe('mañana a las 05:00');
  });
  it('razón de cada agotado', () => {
    expect(razonDeAgotado({ is_available: false, agotado_motivo: 'manana', vuelve_at: '2026-10-03T11:00:00Z' }, 'America/Guatemala', AHORA))
      .toBe('Agotado · vuelve mañana a las 05:00');
    expect(razonDeAgotado({ is_available: false, agotado_motivo: 'ingrediente' }, undefined, AHORA)).toMatch(/ingrediente/);
    expect(razonDeAgotado({ is_available: true, track_stock: true, stock: 0 }, undefined, AHORA)).toBe('Sin existencias · vuelve al reponer');
    expect(razonDeAgotado({ is_available: false, agotado_motivo: 'manual' }, undefined, AHORA)).toBe('Agotado · hasta que lo actives');
  });
});

describe('withEffectiveAvailability', () => {
  it('reescribe is_available con la respuesta y no toca lo que ya cuadra', () => {
    const vuelto = { id: 'a', is_available: false, agotado_motivo: 'manana', vuelve_at: en(-1) };
    const sinStock = { id: 'b', is_available: true, track_stock: true, stock: 0 };
    const normal = { id: 'c', is_available: true };
    const [a, b, c] = withEffectiveAvailability([vuelto, sinStock, normal], AHORA);
    expect(a.is_available).toBe(true);
    expect(b.is_available).toBe(false);
    expect(c).toBe(normal);
  });
});
