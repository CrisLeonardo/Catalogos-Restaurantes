import { describe, expect, it } from 'vitest';
import { rangoEnPalabras } from './rango-en-palabras';

describe('rangoEnPalabras', () => {
  const hoy = '2026-11-18';

  it('dentro del mismo mes dice el día inicial sin repetir el mes', () => {
    expect(rangoEnPalabras('2026-11-01', '2026-11-15', hoy)).toBe('del 1 al 15 nov');
  });

  it('entre meses dice los dos meses', () => {
    expect(rangoEnPalabras('2026-10-20', '2026-11-18', hoy)).toBe('del 20 oct al 18 nov');
  });

  it('un solo día', () => {
    expect(rangoEnPalabras('2026-11-15', '2026-11-15', hoy)).toBe('el 15 nov');
  });

  it('dice el año cuando no es el de hoy', () => {
    expect(rangoEnPalabras('2025-01-01', '2025-01-05', hoy)).toBe('del 1 al 5 ene 2025');
  });

  it('dice el año de la primera fecha cuando el rango cruza de año', () => {
    expect(rangoEnPalabras('2025-12-28', '2026-01-03', hoy)).toBe('del 28 dic 2025 al 3 ene');
  });
});
