import { afterEach, describe, expect, it, vi } from 'vitest';
import { lecturaDe, lecturaFallida, peorEstado, sePuedeConcluir } from './lectura';

const AHORA = new Date('2026-11-04T19:00:00Z');

afterEach(() => vi.restoreAllMocks());

describe('lecturaDe', () => {
  it('sin error: ok con los datos', () => {
    expect(lecturaDe(null, [1, 2], [], { ahora: AHORA })).toEqual({ estado: 'ok', datos: [1, 2], leidoEn: AHORA.toISOString() });
  });

  it('sin error y sin filas: ok con el vacío (aquí SÍ se puede decir «no hay nada»)', () => {
    const l = lecturaDe(null, null, [] as number[], { ahora: AHORA });
    expect(l.estado).toBe('ok');
    expect(l.datos).toEqual([]);
    expect(sePuedeConcluir(l.estado)).toBe(true);
  });

  it('un error cualquiera NO es una lista vacía: estado error (PA-T09, PA-T16)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const l = lecturaDe({ code: '57014', message: 'canceling statement due to statement timeout' }, null, [] as number[], { contexto: 'prueba' });
    expect(l.estado).toBe('error');
    expect(l.datos).toEqual([]);
    expect(sePuedeConcluir(l.estado)).toBe(false);
  });

  it('el error se registra en el servidor con su contexto', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    lecturaDe({ code: 'XX000', message: 'boom' }, null, 0, { contexto: 'cupones' });
    expect(spy).toHaveBeenCalledWith('[lectura] cupones:', 'XX000', 'boom');
  });

  it('tabla, columna o función ausente: falta-migracion, no error', () => {
    expect(lecturaDe({ code: 'PGRST205' }, null, []).estado).toBe('falta-migracion');
    expect(lecturaDe({ code: '42703' }, null, []).estado).toBe('falta-migracion');
    expect(lecturaDe({ code: 'PGRST202' }, null, []).estado).toBe('falta-migracion');
  });

  it('cortada en un tope: parcial', () => {
    expect(lecturaDe(null, [1], [], { parcial: true }).estado).toBe('parcial');
  });

  it('una excepción también es una lectura fallida', () => {
    expect(lecturaFallida([] as number[], AHORA)).toEqual({ estado: 'error', datos: [], leidoEn: AHORA.toISOString() });
  });
});

describe('peorEstado', () => {
  it('si una parte falló, el conjunto falló', () => {
    expect(peorEstado('ok', 'error', 'parcial')).toBe('error');
    expect(peorEstado('ok', 'parcial')).toBe('parcial');
    expect(peorEstado('ok', 'falta-migracion')).toBe('falta-migracion');
    expect(peorEstado('ok', 'ok')).toBe('ok');
    expect(peorEstado()).toBe('ok');
  });
});
