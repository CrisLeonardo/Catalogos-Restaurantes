/** Catálogo (auditoría 1.9): precio, sellos y dietas, opciones, lote, filtros y orden. */
import { describe, expect, it } from 'vitest';
import {
  contarFiltros, dietaDeSello, filtrar, ordenar, precioNuevo, previaDePrecios, problemaDeGrupo,
  separarSellos, validarPrecio,
} from '@/lib/catalogo/reglas';
import type { ProductOptionGroup } from '@/types';

describe('precio', () => {
  it('acepta cero y dos decimales, también con coma', () => {
    expect(validarPrecio('0')).toEqual({ valor: 0 });
    expect(validarPrecio('35,5')).toEqual({ valor: 35.5 });
  });
  it('rechaza negativos, tres decimales, vacío y absurdos', () => {
    expect(validarPrecio('-1')).toEqual({ error: 'El precio no puede ser negativo.' });
    expect(validarPrecio('3.999')).toHaveProperty('error');
    expect(validarPrecio('')).toHaveProperty('error');
    expect(validarPrecio('2000000')).toHaveProperty('error');
  });
});

describe('sellos y dietas', () => {
  it('reconoce la dieta sin importar mayúsculas ni acentos', () => {
    expect(dietaDeSello(' VEGANO ')).toBe('vegano');
    expect(dietaDeSello('bajo en azucar')).toBe('bajo_en_azucar');
    expect(dietaDeSello('Nuevo')).toBeNull();
  });
  it('un sello que es dieta pasa a la dieta y no se repite', () => {
    expect(separarSellos(['Nuevo', 'Picante', 'nuevo', ' '], ['vegano'])).toEqual({ sellos: ['Nuevo'], dietas: ['vegano', 'picante'] });
    // Las claves que guardaba el formulario anterior también son dietas.
    expect(separarSellos(['hot', 'new', 'veg'])).toEqual({ sellos: ['new'], dietas: ['picante', 'vegano'] });
  });
});

describe('opciones inequívocas (M03)', () => {
  const g = (o: Partial<ProductOptionGroup>): ProductOptionGroup => ({
    id: 'g', name: 'Extras', type: 'multi', choices: [{ id: 'a', name: 'A', priceDelta: 0 }, { id: 'b', name: 'B', priceDelta: 5 }], ...o,
  });
  it('mínimo no mayor que el máximo ni que las opciones', () => {
    expect(problemaDeGrupo(g({ min: 3, max: 2 }))).toMatch(/mínimo \(3\) es mayor/);
    expect(problemaDeGrupo(g({ min: 3 }))).toMatch(/sólo hay 2/);
    expect(problemaDeGrupo(g({ min: 1, max: 2 }))).toBeNull();
  });
  it('la predeterminada sólo en «elegir 1» y debe existir', () => {
    expect(problemaDeGrupo(g({ type: 'single', defaultChoiceId: 'b' }))).toBeNull();
    expect(problemaDeGrupo(g({ type: 'single', defaultChoiceId: 'x' }))).toMatch(/ya no está/);
    expect(problemaDeGrupo(g({ defaultChoiceId: 'a' }))).toMatch(/elegir 1/);
  });
});

describe('lote', () => {
  it('redondea a centavos igual que la 179 y marca negativos', () => {
    expect(precioNuevo(65.5, { modo: 'porcentaje', valor: 10 })).toBe(72.05);
    expect(previaDePrecios([{ id: '1', name: 'Barato', price: 3 }], { modo: 'monto', valor: -5 }))
      .toEqual([{ id: '1', nombre: 'Barato', antes: 3, despues: -2, negativo: true }]);
  });
});

describe('filtros y orden', () => {
  const base = { is_available: true, is_active: true, image_url: 'x', cost: 1, category_id: 'c1', sort_order: 0, updated_at: '2026-01-01' };
  const ps = [
    { ...base, name: 'Zeta', image_url: null, sort_order: 2 },
    { ...base, name: 'Alfa', is_available: false, image_url: null, category_id: 'c2', updated_at: '2026-03-01' },
    { ...base, name: 'Beta', cost: null, category_id: null },
  ];
  it('cuenta y combina filtros', () => {
    expect(contarFiltros(ps)).toEqual({ agotado: 1, oculto: 0, sin_foto: 2, sin_costo: 1, sin_categoria: 1 });
    expect(filtrar(ps, ['sin_foto', 'agotado']).map((p) => p.name)).toEqual(['Alfa']);
  });
  it('ordena como en la carta, por nombre o por última edición', () => {
    const cats = new Map([['c2', 0], ['c1', 1]]);
    expect(ordenar(ps, 'carta', cats).map((p) => p.name)).toEqual(['Alfa', 'Zeta', 'Beta']);
    expect(ordenar(ps, 'nombre').map((p) => p.name)).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(ordenar(ps, 'edicion')[0].name).toBe('Alfa');
  });
});
