import { describe, expect, it } from 'vitest';
import { leerPlatosDelAlta, modosEstandar, planSugerido } from '@/lib/alta';

describe('planSugerido', () => {
  it('sugiere el plan por cómo le piden, no Premium para todos', () => {
    expect(planSugerido('carta')).toBe('BASICO');
    expect(planSugerido('llevar')).toBe('EN_LINEA');
    expect(planSugerido('mesas')).toBe('PREMIUM');
  });
  it('Estándar toma dos modos que encajan', () => {
    expect(modosEstandar('llevar')).toEqual(['pickup', 'delivery']);
    expect(modosEstandar('mesas')).toEqual(['dine_in', 'pickup']);
  });
});

describe('leerPlatosDelAlta', () => {
  const leer = (filas: unknown) => leerPlatosDelAlta(JSON.stringify(filas));

  it('sin platillos no es un error: «Lo hago después»', () => {
    expect(leerPlatosDelAlta(null)).toEqual({ lista: [] });
    expect(leer([{ nombre: '', precio: '' }])).toEqual({ lista: [] });
  });
  it('acepta coma decimal y redondea a centavos', () => {
    expect(leer([{ nombre: 'Café americano', precio: '15,5' }, { nombre: ' Pan con frijol ', precio: '12.005' }]))
      .toEqual({ lista: [{ nombre: 'Café americano', precio: 15.5 }, { nombre: 'Pan con frijol', precio: 12.01 }] });
  });
  it('rechaza una fila a medias en vez de crear un precio en cero', () => {
    expect(leer([{ nombre: 'Café', precio: '' }])).toEqual({ error: 'Revisa el precio de «Café».' });
    expect(leer([{ nombre: '', precio: '10' }])).toEqual({ error: 'A un platillo le falta el nombre.' });
    expect(leer([{ nombre: 'Café', precio: '-3' }])).toEqual({ error: 'Revisa el precio de «Café».' });
  });
  it('no pasa de veinte platillos', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ nombre: `Plato ${i}`, precio: '10' }));
    const r = leer(muchos);
    expect('lista' in r && r.lista.length).toBe(20);
  });
  it('un texto que no es JSON se explica', () => {
    expect(leerPlatosDelAlta('{roto')).toEqual({ error: 'No pudimos leer tus platillos. Vuelve a escribirlos.' });
  });
});
