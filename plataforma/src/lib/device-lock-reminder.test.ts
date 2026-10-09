import { describe, expect, it } from 'vitest';
import { debeRecordarCandado } from './device-lock-reminder';

const ahora = Date.parse('2026-10-20T12:00:00Z');
const hace = (dias: number) => new Date(ahora - dias * 86_400_000).toISOString();

describe('debeRecordarCandado', () => {
  it('apagado, con aparatos de hace más de una semana: sí', () => {
    expect(debeRecordarCandado({ candadoEncendido: false, aparatos: 3, primerAparatoEn: hace(8), ahora })).toBe(true);
  });

  it('justo a los 7 días: sí', () => {
    expect(debeRecordarCandado({ candadoEncendido: false, aparatos: 1, primerAparatoEn: hace(7), ahora })).toBe(true);
  });

  it('antes de la semana: todavía no (falta que se registren los otros turnos)', () => {
    expect(debeRecordarCandado({ candadoEncendido: false, aparatos: 2, primerAparatoEn: hace(3), ahora })).toBe(false);
  });

  it('sin aparatos: no (encenderlo dejaría a todos fuera)', () => {
    expect(debeRecordarCandado({ candadoEncendido: false, aparatos: 0, primerAparatoEn: null, ahora })).toBe(false);
  });

  it('ya encendido: no', () => {
    expect(debeRecordarCandado({ candadoEncendido: true, aparatos: 3, primerAparatoEn: hace(30), ahora })).toBe(false);
  });

  it('fecha ilegible: no', () => {
    expect(debeRecordarCandado({ candadoEncendido: false, aparatos: 3, primerAparatoEn: 'ayer', ahora })).toBe(false);
  });
});
