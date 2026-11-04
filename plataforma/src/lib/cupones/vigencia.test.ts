import { describe, expect, it } from 'vitest';
import {
  conservarSiNoCambio, estadoDelCupon, esFecha, fechaDeFin, fechaDeInicio, fechaLegible, finDeFecha, inicioDeFecha,
  vigenciaDesdeFormulario, type CuponVigencia,
} from './vigencia';

const GT = 'America/Guatemala'; // UTC-6, sin horario de verano

const BASE: CuponVigencia = { is_active: true, valid_from: null, valid_until: null, max_uses: null, uses: 0 };
const t = (iso: string) => new Date(iso).getTime();

describe('el desfase que había (X05)', () => {
  it('una fecha suelta guardada como medianoche UTC vence a las 18:00 del día anterior en Guatemala', () => {
    // Lo que Postgres guardaba con `'2026-11-10'::timestamptz` en una base en UTC.
    const viejo = { ...BASE, valid_until: '2026-11-10T00:00:00Z' };
    // 9 de noviembre a las 18:00 en Guatemala: ya «vencido».
    expect(estadoDelCupon(viejo, t('2026-11-10T00:00:00Z'))).toBe('vencido');
    expect(fechaDeFin(viejo.valid_until!, GT)).toBe('2026-11-09');
  });
});

describe('fechas del formulario ↔ instantes (zona del local)', () => {
  it('«hasta el 10» vale todo el 10 en Guatemala: límite exclusivo a las 00:00 del 11', () => {
    expect(finDeFecha('2026-11-10', GT)).toBe('2026-11-11T06:00:00.000Z');
  });

  it('«desde el 5» empieza a las 00:00 del 5 en Guatemala', () => {
    expect(inicioDeFecha('2026-11-05', GT)).toBe('2026-11-05T06:00:00.000Z');
  });

  it('el día elegido vuelve igual al leerlo (ida y vuelta)', () => {
    expect(fechaDeFin(finDeFecha('2026-11-10', GT), GT)).toBe('2026-11-10');
    expect(fechaDeInicio(inicioDeFecha('2026-11-05', GT), GT)).toBe('2026-11-05');
  });

  it('fin de mes y de año', () => {
    expect(finDeFecha('2026-12-31', GT)).toBe('2027-01-01T06:00:00.000Z');
    expect(finDeFecha('2028-02-28', GT)).toBe('2028-02-29T06:00:00.000Z');
  });

  it('en otra zona usa su propia medianoche', () => {
    expect(finDeFecha('2026-11-10', 'America/Mexico_City')).toBe('2026-11-11T06:00:00.000Z');
    expect(finDeFecha('2026-11-10', 'Europe/Madrid')).toBe('2026-11-10T23:00:00.000Z');
  });

  it('la fecha legible no depende de la zona del aparato', () => {
    expect(fechaLegible('2026-11-10')).toMatch(/10/);
    expect(fechaLegible('2026-11-10')).toMatch(/2026/);
  });
});

describe('estadoDelCupon (PA-T04, PA-T05)', () => {
  const hasta10 = { ...BASE, valid_until: finDeFecha('2026-11-10', GT) };

  it('sigue vigente a las 23:59 del día en que vence (Guatemala)', () => {
    expect(estadoDelCupon(hasta10, t('2026-11-11T05:59:00Z'))).toBe('vigente');
  });

  it('vence a las 00:00 del día siguiente (Guatemala)', () => {
    expect(estadoDelCupon(hasta10, t('2026-11-11T06:00:00Z'))).toBe('vencido');
  });

  it('un cupón con inicio futuro está programado, no activo', () => {
    const desde5 = { ...BASE, valid_from: inicioDeFecha('2026-11-05', GT) };
    expect(estadoDelCupon(desde5, t('2026-11-05T05:59:00Z'))).toBe('programado');
    expect(estadoDelCupon(desde5, t('2026-11-05T06:00:00Z'))).toBe('vigente');
  });

  it('pausado gana a todo lo demás', () => {
    expect(estadoDelCupon({ ...hasta10, is_active: false }, t('2026-12-01T00:00:00Z'))).toBe('pausado');
  });

  it('agotado al llegar al máximo de usos', () => {
    expect(estadoDelCupon({ ...BASE, max_uses: 3, uses: 3 })).toBe('agotado');
    expect(estadoDelCupon({ ...BASE, max_uses: 3, uses: 2 })).toBe('vigente');
  });

  it('vencido gana a agotado: ya no se va a poder usar de ninguna forma', () => {
    expect(estadoDelCupon({ ...hasta10, max_uses: 1, uses: 1 }, t('2026-12-01T00:00:00Z'))).toBe('vencido');
  });
});

describe('conservarSiNoCambio (PA-T04: editar no mueve la vigencia)', () => {
  // Un cupón guardado a una hora cualquiera (semillas, SQL a mano, datos viejos).
  const previas = { valid_from: '2026-11-05T19:34:11.995Z', valid_until: '2026-11-15T19:34:11.995Z' };

  it('si los días no cambian, conserva los instantes guardados tal cual', () => {
    const nuevas = vigenciaDesdeFormulario('2026-11-05', '2026-11-15', GT) as { valid_from: string; valid_until: string };
    expect(conservarSiNoCambio(nuevas, previas, GT)).toEqual(previas);
  });

  it('si cambia un día, solo ese lado toma el valor nuevo', () => {
    const nuevas = vigenciaDesdeFormulario('2026-11-05', '2026-11-20', GT) as { valid_from: string; valid_until: string };
    expect(conservarSiNoCambio(nuevas, previas, GT)).toEqual({
      valid_from: previas.valid_from,
      valid_until: '2026-11-21T06:00:00.000Z',
    });
  });

  it('quitar una fecha la quita', () => {
    expect(conservarSiNoCambio({ valid_from: null, valid_until: null }, previas, GT)).toEqual({ valid_from: null, valid_until: null });
  });
});

describe('vigenciaDesdeFormulario', () => {
  it('convierte las dos fechas a instantes de la zona del local', () => {
    expect(vigenciaDesdeFormulario('2026-11-05', '2026-11-10', GT)).toEqual({
      valid_from: '2026-11-05T06:00:00.000Z',
      valid_until: '2026-11-11T06:00:00.000Z',
    });
  });

  it('sin fechas = sin límites', () => {
    expect(vigenciaDesdeFormulario(null, null, GT)).toEqual({ valid_from: null, valid_until: null });
  });

  it('el mismo día de inicio y de fin es válido (un cupón de un día)', () => {
    expect(vigenciaDesdeFormulario('2026-11-10', '2026-11-10', GT)).not.toHaveProperty('error');
  });

  it('rechaza un vencimiento anterior al inicio', () => {
    expect(vigenciaDesdeFormulario('2026-11-10', '2026-11-05', GT)).toHaveProperty('error');
  });

  it('rechaza fechas que no existen o con otro formato', () => {
    expect(vigenciaDesdeFormulario('2026-02-30', null, GT)).toHaveProperty('error');
    expect(vigenciaDesdeFormulario(null, '10/11/2026', GT)).toHaveProperty('error');
    expect(esFecha('2026-11-10')).toBe(true);
    expect(esFecha('2026-13-01')).toBe(false);
  });
});
