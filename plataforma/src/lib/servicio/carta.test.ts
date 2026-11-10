import { describe, it, expect } from 'vitest';
import { esPersonalizable, iniciales, quedanPocos, tinteDe } from './carta';

describe('iniciales', () => {
  it('dos iniciales sin contar «de» ni lo que va entre paréntesis', () => {
    expect(iniciales('Tacos de carnitas')).toBe('TC');
    expect(iniciales('Margarita (mediana)')).toBe('MA');
    expect(iniciales('Café de olla')).toBe('CO');
    expect(iniciales('La Rincón Especial (familiar)')).toBe('RE');
  });

  it('una palabra da sus dos primeras letras', () => {
    expect(iniciales('Hilachas')).toBe('HI');
  });

  it('no revienta con nombres raros', () => {
    expect(iniciales('  ')).toBe('');
    expect(iniciales('7up')).toBe('7U');
  });
});

describe('tinteDe', () => {
  it('el mismo nombre da siempre el mismo color', () => {
    expect(tinteDe('Pepián')).toBe(tinteDe('Pepián'));
    expect(tinteDe('Pepián')).toMatch(/^hsl\(\d+ 62% 52%\)$/);
  });
});

describe('quedanPocos', () => {
  const base = { track_stock: true, stock: 3, low_stock_threshold: 5, is_available: true };

  it('avisa cuando bajó del mínimo', () => {
    expect(quedanPocos(base)).toBe(3);
  });

  it('calla con existencia de sobra o sin control', () => {
    expect(quedanPocos({ ...base, stock: 20 })).toBeNull();
    expect(quedanPocos({ ...base, track_stock: false })).toBeNull();
    expect(quedanPocos({ ...base, stock: null })).toBeNull();
  });

  it('en cero o agotado no dice «quedan»: lo dice «Agotado»', () => {
    expect(quedanPocos({ ...base, stock: 0 })).toBeNull();
    expect(quedanPocos({ ...base, is_available: false })).toBeNull();
  });
});

describe('esPersonalizable', () => {
  const grupo = { id: 'g', name: 'Extras', type: 'multi' as const, choices: [{ id: 'c', name: 'Queso', priceDelta: 5 }] };

  it('un plato con algo que elegir abre su hoja, aunque nada sea obligatorio', () => {
    expect(esPersonalizable({ options: [grupo] })).toBe(true);
    expect(esPersonalizable({ options: [{ ...grupo, type: 'combo' }] })).toBe(true);
  });

  it('sin opciones, o con grupos vacíos, sigue siendo un toque', () => {
    expect(esPersonalizable({ options: null })).toBe(false);
    expect(esPersonalizable({ options: [] })).toBe(false);
    expect(esPersonalizable({ options: [{ ...grupo, choices: [] }] })).toBe(false);
  });
});
