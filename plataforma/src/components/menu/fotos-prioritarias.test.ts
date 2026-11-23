import { describe, expect, it } from 'vitest';
import { fotosPrioritarias } from './catalog';

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe('las primeras fotos de la carta salen primero (LZ-12)', () => {
  it('las dos primeras con prioridad alta y las dos siguientes sin esperar al JS', () => {
    expect([...fotosPrioritarias(ids(10), new Set())]).toEqual([
      ['p1', 'alta'], ['p2', 'alta'], ['p3', 'eager'], ['p4', 'eager'],
    ]);
  });
  it('los destacados van delante, como en el mosaico', () => {
    const m = fotosPrioritarias(ids(10), new Set(['p7']));
    expect(m.get('p7')).toBe('alta');
    expect(m.get('p1')).toBe('alta');
    expect(m.has('p4')).toBe(false);
  });
  it('una sección corta no inventa piezas', () => {
    expect(fotosPrioritarias(ids(1), new Set()).size).toBe(1);
  });
});
