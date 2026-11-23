import { describe, expect, it } from 'vitest';
import { enlaceDeAlta, leerIntencion, leerPlatosDelAlta, modosEstandar, planParaTuCaso, planSugerido } from '@/lib/alta';

describe('planSugerido', () => {
  it('sugiere el plan por cómo le piden, no Premium para todos', () => {
    expect(planSugerido('carta')).toBe('BASICO');
    expect(planSugerido('llevar')).toBe('EN_LINEA');
    expect(planSugerido('mesas')).toBe('PREMIUM');
  });
  it('en mostrador sugiere Estándar con local y para llevar (LZ-11)', () => {
    expect(planSugerido('mostrador')).toBe('ESTANDAR');
    expect(modosEstandar('mostrador')).toEqual(['dine_in', 'pickup']);
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

describe('planParaTuCaso (web pública, V.2/V.3)', () => {
  it('usa la misma regla que el alta en sus tres casos', () => {
    expect(planParaTuCaso('carta')).toBe(planSugerido('carta'));
    expect(planParaTuCaso('llevar')).toBe(planSugerido('llevar'));
    expect(planParaTuCaso('mesas')).toBe(planSugerido('mesas'));
  });

  it('mostrador va a Estándar', () => {
    expect(planParaTuCaso('mostrador')).toBe('ESTANDAR');
  });

  it('para llevar con más de 300 pedidos al mes pasa a Estándar', () => {
    expect(planParaTuCaso('llevar', true)).toBe('ESTANDAR');
    expect(planParaTuCaso('mesas', true)).toBe('PREMIUM');
  });
});

describe('intención que viaja de la web al alta (LZ-11)', () => {
  it('conserva plan y caso válidos', () => {
    expect(leerIntencion('ESTANDAR', 'mostrador')).toEqual({ plan: 'ESTANDAR', caso: 'mostrador' });
    expect(leerIntencion('ESTANDAR', 'llevar')).toEqual({ plan: 'ESTANDAR', caso: 'llevar' });
  });
  it('con solo el caso, el plan sale de la regla de la web', () => {
    expect(leerIntencion(null, 'llevar')).toEqual({ plan: 'EN_LINEA', caso: 'llevar' });
  });
  it('con solo el plan, el caso es el que lo sugiere', () => {
    expect(leerIntencion('PREMIUM', undefined)).toEqual({ plan: 'PREMIUM', caso: 'mesas' });
  });
  it('ignora valores fuera de lista: no se elige un plan que no existe', () => {
    expect(leerIntencion('PRO', 'cocina')).toBeNull();
    expect(leerIntencion('premium', ['mesas'])).toBeNull();
    expect(leerIntencion('GRATIS', 'carta')).toEqual({ plan: 'BASICO', caso: 'carta' });
  });
  it('arma el enlace del registro', () => {
    expect(enlaceDeAlta({ plan: 'ESTANDAR', caso: 'mostrador' })).toBe('/registro?plan=ESTANDAR&caso=mostrador');
    expect(enlaceDeAlta(null)).toBe('/registro');
  });
});
