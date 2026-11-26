import { describe, expect, it } from 'vitest';
import { avisoDeExportacion } from './aviso-exportacion';

const hoy = new Date('2026-11-24T18:00:00Z');

describe('aviso antes de borrar un local (LZ-10)', () => {
  it('sin la migración 195 no dice nada', () => {
    expect(avisoDeExportacion(undefined, 'America/Guatemala', hoy)).toBeNull();
  });

  it('si no exportó, avisa y el botón dice «Eliminar de todos modos»', () => {
    expect(avisoDeExportacion(null, 'America/Guatemala', hoy)).toEqual({
      exporto: false,
      linea: 'El dueño todavía no ha exportado sus datos.',
      aviso: 'El dueño no ha exportado sus datos: no podrá recuperarlos.',
      confirmar: 'Eliminar de todos modos',
    });
  });

  it('si exportó, dice cuándo, en la hora de Guatemala', () => {
    // 03:00 UTC del 13 = 21:00 del 12 en Guatemala.
    const a = avisoDeExportacion('2026-11-13T03:00:00Z', 'America/Guatemala', hoy);
    expect(a).toEqual({ exporto: true, linea: 'Exportó sus datos el 12 de noviembre.', confirmar: 'Eliminar' });
  });

  it('pone el año si fue otro año', () => {
    expect(avisoDeExportacion('2025-03-02T18:00:00Z', 'America/Guatemala', hoy)?.linea)
      .toBe('Exportó sus datos el 2 de marzo de 2025.');
  });
});
