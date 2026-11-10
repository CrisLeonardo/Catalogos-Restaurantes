/** Recepción (auditoría 1.8): aforo, ocupación, horas con lugar, mesa sugerida, espera y aviso. */
import { describe, expect, it } from 'vitest';
import {
  aforoDeMesas, aHora, aMinutos, estadoDeAviso, franjasDelDia, horasConLugar, mesaSugerida,
  ocupacionEn, rangoDeEspera,
} from '@/lib/recepcion/agenda';

const r = (time: string, party_size: number, id?: string) => ({ time, party_size, id });

describe('aforo', () => {
  it('suma las plazas y cuenta de 4 las mesas sin plazas', () => {
    expect(aforoDeMesas([{ n: 1, capacidad: 2 }, { n: 2, capacidad: 6 }, { n: 3, capacidad: null }])).toEqual({ total: 12, sinPlazas: 1 });
  });
  it('sin mesas no hay aforo que comprobar', () => {
    expect(aforoDeMesas([])).toEqual({ total: null, sinPlazas: 0 });
  });
});

describe('ocupación (igual que leogin_ocupacion_reservas)', () => {
  const dia = [r('20:00', 4), r('21:00', 6), r('22:30', 8)];
  it('cuenta personas a la vez', () => {
    expect(ocupacionEn(dia, aMinutos('20:30'), 90)).toBe(10);
    expect(ocupacionEn(dia, aMinutos('18:00'), 90)).toBe(0);
  });
  it('excluye la reserva que se reprograma', () => {
    expect(ocupacionEn([r('20:00', 30, 'a'), r('21:30', 10)], aMinutos('21:00'), 60, 'a')).toBe(10);
  });
});

describe('agenda por horas', () => {
  it('marca alta la franja con 80 % o más del aforo', () => {
    const f = franjasDelDia([r('19:00', 20), r('20:00', 14)], 40, 90);
    expect(f.map((x) => [x.hora, x.personas, x.alta])).toEqual([['19:00', 20, false], ['20:00', 34, true]]);
  });
  it('sin reservas no inventa franjas', () => {
    expect(franjasDelDia([], 40, 90)).toEqual([]);
  });
});

describe('horas con lugar', () => {
  it('sugiere las más cercanas donde el grupo cabe', () => {
    const dia = [r('20:00', 34)];
    expect(horasConLugar(dia, 8, 40, 90, aMinutos('20:00'))).toEqual([
      { hora: '21:30', libres: 40 }, { hora: '18:30', libres: 40 },
    ]);
  });
});

describe('mesa sugerida', () => {
  it('elige la más justa y lo explica', () => {
    expect(mesaSugerida([{ n: 3, capacidad: 6 }, { n: 7, capacidad: 4 }, { n: 9, capacidad: 2 }], 4))
      .toEqual({ mesa: 7, motivo: 'Justa para 4.' });
    expect(mesaSugerida([{ n: 3, capacidad: 6 }, { n: 7, capacidad: 8 }], 5))
      .toEqual({ mesa: 3, motivo: 'La más justa para 5: no ocupa una más grande.' });
  });
  it('sin plazas definidas lo advierte; sin mesa que sirva, no sugiere', () => {
    expect(mesaSugerida([{ n: 5, capacidad: null }], 4)?.motivo).toMatch(/revisa que quepan/);
    expect(mesaSugerida([{ n: 9, capacidad: 2 }], 4)).toBeNull();
    expect(mesaSugerida([{ n: 1, capacidad: null }], 14)).toBeNull();
  });
});

describe('espera estimada', () => {
  it('da un rango con evidencia y no estima con menos de 3 grupos', () => {
    expect(rangoDeEspera([10, 14, 18, 22, 25, 40])).toEqual({ desde: 15, hasta: 25, grupos: 6 });
    expect(rangoDeEspera([10, 20])).toBeNull();
  });
});

describe('aviso honesto (PA-T20)', () => {
  it('abrir WhatsApp no cuenta como avisado', () => {
    expect(estadoDeAviso({ status: 'WAITING', aviso_abierto_at: '2026-11-09T01:00:00Z' })).toBe('abierto');
    expect(estadoDeAviso({ status: 'NOTIFIED', aviso_abierto_at: null })).toBe('avisado');
    expect(estadoDeAviso({ status: 'WAITING' })).toBe('sin_avisar');
  });
});

it('aHora da la vuelta al día', () => {
  expect(aHora(25 * 60 + 5)).toBe('01:05');
});
