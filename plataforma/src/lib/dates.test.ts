/** Fechas y «hace cuánto» (auditoría 2026-10-02, T-02). */
import { describe, it, expect } from 'vitest';
import { haceTiempo, fechaCorta, mesYAnio, conMesesLegibles } from './dates';

const AHORA = Date.parse('2026-10-02T18:00:00Z');
const MIN = 60_000;

describe('haceTiempo', () => {
  it('minutos, horas, ayer, días', () => {
    expect(haceTiempo(AHORA - 20_000, AHORA)).toBe('hace un momento');
    expect(haceTiempo(AHORA - 5 * MIN, AHORA)).toBe('hace 5 min');
    expect(haceTiempo(AHORA - 3 * 60 * MIN, AHORA)).toBe('hace 3 h');
    expect(haceTiempo(AHORA - 30 * 60 * MIN, AHORA)).toBe('ayer');
    expect(haceTiempo(AHORA - 4 * 24 * 60 * MIN, AHORA)).toBe('hace 4 días');
  });

  it('nunca dice «hace 2004 h»: pasado el mes, la fecha', () => {
    expect(haceTiempo(AHORA - 20 * 24 * 60 * MIN, AHORA)).toBe('hace 20 días');
    // 2004 h = 83,5 días: a esa escala se dice la fecha.
    expect(haceTiempo(AHORA - 2004 * 60 * MIN, AHORA)).toMatch(/^el 11 jul/);
  });
});

describe('fechaCorta', () => {
  it('una fecha sola no se corre un día por la zona horaria', () => {
    expect(fechaCorta('2026-09-01')).toMatch(/^1 sept?\.? 2026$/);
  });

  it('un instante se lee en hora de Guatemala', () => {
    // 2026-07-18 03:00 UTC = 17 de julio 21:00 en Guatemala.
    expect(fechaCorta('2026-07-18T03:00:00Z')).toMatch(/^17 jul/);
  });
});

describe('meses', () => {
  it('«2026-09» con nombre', () => {
    expect(mesYAnio('2026-09')).toBe('septiembre de 2026');
  });

  it('dentro de un texto, sin tocar fechas completas', () => {
    expect(conMesesLegibles('Mensualidad 2026-09')).toBe('Mensualidad septiembre de 2026');
    expect(conMesesLegibles('Vence 2026-09-01')).toBe('Vence 2026-09-01');
  });
});
