/** Periodos de Negocio › Resumen (auditoría 2026-10-02, D-3). */
import { describe, it, expect } from 'vitest';
import { sumarDias, rangoDePeriodo, medianocheLocalUtc, comparacion, serieCompleta, esPeriodo } from './periodo';

describe('rangos', () => {
  it('suma y resta días cruzando meses', () => {
    expect(sumarDias('2026-10-03', -6)).toBe('2026-09-27');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('la semana termina hoy y la anterior es la de antes, sin solaparse', () => {
    expect(rangoDePeriodo('2026-10-03', 7)).toEqual({
      from: '2026-09-27', to: '2026-10-03', prevFrom: '2026-09-20', prevTo: '2026-09-26',
    });
  });

  it('solo «semana» y «mes» son periodos', () => {
    expect(esPeriodo('mes')).toBe(true);
    expect(esPeriodo('año')).toBe(false);
  });
});

describe('medianoche local', () => {
  it('Guatemala (UTC-6): el día empieza a las 06:00 UTC', () => {
    expect(medianocheLocalUtc('2026-10-03', 'America/Guatemala')).toBe('2026-10-03T06:00:00.000Z');
  });

  it('una zona inválida no rompe: usa UTC', () => {
    expect(medianocheLocalUtc('2026-10-03', 'No/Existe')).toBe('2026-10-03T00:00:00.000Z');
  });
});

describe('comparación', () => {
  it('sube, baja o igual, redondeado', () => {
    expect(comparacion(112, 100, 7)).toEqual({ texto: '↑ 12 % vs. los 7 días anteriores', signo: 'sube' });
    expect(comparacion(80, 100, 30)).toEqual({ texto: '↓ 20 % vs. los 30 días anteriores', signo: 'baja' });
    expect(comparacion(100, 100, 7)?.signo).toBe('igual');
  });

  it('sin nada antes no se compara (no hay «↑ ∞ %»)', () => {
    expect(comparacion(50, 0, 7)).toBeNull();
  });
});

describe('serie completa', () => {
  it('rellena los días sin ventas', () => {
    const s = serieCompleta([{ date: '2026-10-02', v: 5 }], '2026-10-01', 3, (date) => ({ date, v: 0 }));
    expect(s.map((d) => `${d.date}:${d.v}`)).toEqual(['2026-10-01:0', '2026-10-02:5', '2026-10-03:0']);
  });
});
