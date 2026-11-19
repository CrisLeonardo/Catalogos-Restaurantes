import { describe, expect, it } from 'vitest';
import { minutosParaCerrar } from './hours';

// Guatemala no tiene horario de verano: UTC-6 todo el año.
const TZ = 'America/Guatemala';
/** Miércoles 18 de noviembre de 2026 a la hora local dada. */
const a = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-06:00`);

describe('minutosParaCerrar', () => {
  const semana = { '3': [['08:00', '22:00']] } as never;

  it('cuenta los minutos hasta el cierre de hoy', () => {
    expect(minutosParaCerrar(semana, TZ, a('21:20'))).toBe(40);
  });

  it('null si está cerrado o sin horario', () => {
    expect(minutosParaCerrar(semana, TZ, a('23:00'))).toBeNull();
    expect(minutosParaCerrar(null, TZ, a('12:00'))).toBeNull();
  });

  it('entiende los turnos que cruzan la medianoche', () => {
    const noche = { '3': [['20:00', '02:00']], '4': [] } as never;
    expect(minutosParaCerrar(noche, TZ, a('23:30'))).toBe(150);
    // Jueves 01:30, todavía del turno del miércoles.
    expect(minutosParaCerrar(noche, TZ, new Date('2026-11-19T01:30:00-06:00'))).toBe(30);
  });
});
