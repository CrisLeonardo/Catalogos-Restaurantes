/**
 * ¿Se puede pedir? (auditoría 2026-10-02, CAT-01)
 *
 * La regla se usa en el menú, en el servidor al validar un pedido, en la
 * lista de Platillos y en Tomar pedidos. Si estos casos cambian, cambian
 * los cuatro a la vez — que es justo lo que se busca.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_RESTORE_MS,
  isAutoRestored,
  isOutOfStock,
  isUnavailable,
  withEffectiveAvailability,
} from './product-availability';

const AHORA = Date.parse('2026-10-02T18:00:00Z');
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

describe('isUnavailable', () => {
  it('disponible es disponible', () => {
    expect(isUnavailable({ is_available: true }, AHORA)).toBe(false);
  });

  it('agotado hace una hora sigue agotado', () => {
    expect(isUnavailable({ is_available: false, unavailable_at: hace(60 * 60_000) }, AHORA)).toBe(true);
  });

  it('agotado hace más de 12 h ya volvió solo', () => {
    const p = { is_available: false, unavailable_at: hace(AUTO_RESTORE_MS + 1) };
    expect(isUnavailable(p, AHORA)).toBe(false);
    expect(isAutoRestored(p, AHORA)).toBe(true);
  });

  it('agotado sin hora no tiene reloj: se queda fuera', () => {
    expect(isUnavailable({ is_available: false, unavailable_at: null }, AHORA)).toBe(true);
  });

  it('sin existencias manda sobre el reloj de 12 h', () => {
    // place_order lo marca agotado CON hora al llegar a cero: sin esta regla,
    // a las 12 h volvía al menú aunque el inventario siguiera en cero.
    const p = { is_available: false, unavailable_at: hace(AUTO_RESTORE_MS * 3), track_stock: true, stock: 0 };
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

describe('withEffectiveAvailability', () => {
  it('reescribe is_available con la respuesta y no toca lo que ya cuadra', () => {
    const vuelto = { id: 'a', is_available: false, unavailable_at: hace(AUTO_RESTORE_MS + 1) };
    const sinStock = { id: 'b', is_available: true, track_stock: true, stock: 0 };
    const normal = { id: 'c', is_available: true };
    const [a, b, c] = withEffectiveAvailability([vuelto, sinStock, normal], AHORA);
    expect(a.is_available).toBe(true);
    expect(b.is_available).toBe(false);
    expect(c).toBe(normal);
  });
});
