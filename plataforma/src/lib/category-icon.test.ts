import { describe, expect, it } from 'vitest';
import { suggestIcon } from './category-icon';

describe('suggestIcon', () => {
  it('sugiere por palabra completa, con plural', () => {
    expect(suggestIcon('Café')).toBe('coffee');
    expect(suggestIcon('Bebidas')).toBe('coffee');
    expect(suggestIcon('Tacos')).toBe('flame');
    expect(suggestIcon('Postres')).toBe('cookie');
    expect(suggestIcon('Entradas')).toBe('leaf');
  });
  it('no casa con un trozo de otra palabra', () => {
    // «te» (té) está dentro de «fuertes», pero no es la palabra
    expect(suggestIcon('Platos fuertes')).toBe('flame');
    expect(suggestIcon('Combos de temporada')).toBe('star');
  });
  it('sin pista, el icono genérico', () => {
    expect(suggestIcon('Varios')).toBe('utensils');
  });
});
