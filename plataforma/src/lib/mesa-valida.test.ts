import { describe, expect, it } from 'vitest';
import { mesaExiste } from './mesa-valida';

describe('mesaExiste (auditoría 1.12, M01)', () => {
  it('de 1 al total de mesas del local', () => {
    expect(mesaExiste(4, 20)).toBe(true);
    expect(mesaExiste(20, 20)).toBe(true);
    expect(mesaExiste(999, 20)).toBe(false);
    expect(mesaExiste(0, 20)).toBe(false);
    expect(mesaExiste(2.5, 20)).toBe(false);
  });
  it('sin total configurado no inventa un límite', () => {
    expect(mesaExiste(30, undefined)).toBe(true);
  });
});
