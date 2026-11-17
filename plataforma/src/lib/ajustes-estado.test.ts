import { describe, expect, it } from 'vitest';
import {
  estadoEntrega, estadoHorario, estadoPedidos, modoEntrega, primerSolape, problemaDeTiempos,
  proximasAperturas, pruebaDeDistancia, turnosQueSePisan,
} from './ajustes-estado';

const ZONA = 'America/Guatemala';
// Martes 15 de diciembre de 2026, 13:00 en Guatemala.
const MARTES = new Date('2026-12-15T19:00:00Z');

describe('horario (PA-T02)', () => {
  it('semana vacía es «A toda hora», no «sin horario»', () => {
    expect(estadoHorario(null, null, ZONA, MARTES)).toEqual({ texto: 'A toda hora', tono: 'warn' });
    expect(proximasAperturas(null, null, ZONA, MARTES, 1)[0].texto).toBe('A toda hora');
  });

  it('un día sin turnos con horario es «Cerrado»', () => {
    const r = proximasAperturas({ '3': [['11:00', '22:00']] }, null, ZONA, MARTES, 2);
    expect(r[0]).toMatchObject({ dia: 'Hoy', texto: 'Cerrado', cerrado: true });
    expect(r[1].texto).toBe('11:00 – 22:00');
  });

  it('abierto ahora lo dice con la franja de hoy', () => {
    expect(estadoHorario({ '2': [['11:00', '22:00']] }, null, ZONA, MARTES).texto).toBe('Abierto hoy · 11:00 – 22:00');
  });

  it('el feriado manda sobre el horario semanal (PA-T03)', () => {
    const r = proximasAperturas({ '3': [['11:00', '22:00']] }, { '2026-12-16': [] }, ZONA, MARTES, 2);
    expect(r[1]).toMatchObject({ texto: 'Cerrado (fecha especial)', cerrado: true, especial: true });
  });
});

describe('turnos que se pisan', () => {
  it('detecta el choque y deja pasar turnos seguidos', () => {
    expect(turnosQueSePisan([['13:00', '16:00'], ['15:00', '21:00']])).not.toBeNull();
    expect(turnosQueSePisan([['11:00', '15:00'], ['15:00', '22:00']])).toBeNull();
  });

  it('un turno de madrugada (20:00–02:00) no choca con uno de la mañana', () => {
    expect(turnosQueSePisan([['07:00', '11:00'], ['20:00', '02:00']])).toBeNull();
    expect(turnosQueSePisan([['18:00', '23:00'], ['20:00', '02:00']])).not.toBeNull();
  });

  it('dice el primer día con solape', () => {
    expect(primerSolape({ '6': [['13:00', '16:00'], ['15:00', '21:00']] })?.dia).toBe('6');
    expect(primerSolape(null)).toBeNull();
  });
});

describe('entrega', () => {
  it('nombra la manera de repartir', () => {
    expect(modoEntrega(0, null, false)).toBe('cualquiera');
    expect(modoEntrega(3, null, true)).toBe('zonas');
    expect(modoEntrega(0, 6, true)).toBe('distancia');
    expect(modoEntrega(2, 6, true)).toBe('ambos');
    expect(estadoEntrega(0, null, false)).toEqual({ texto: 'A cualquier dirección', tono: 'warn' });
    expect(estadoEntrega(0, 6, true).texto).toBe('Hasta 6 km');
  });

  it('la frontera exacta cuenta como dentro y es estable', () => {
    const local: [number, number] = [14.6407, -90.5133];
    const lejos = pruebaDeDistancia(local, [14.7, -90.5133], 3);
    expect(lejos.dentro).toBe(false);
    const borde = pruebaDeDistancia(local, [14.6407, -90.5133], 0);
    expect(borde).toEqual({ dentro: true, km: 0 });
  });
});

describe('pedidos y cobro (R29.3)', () => {
  const base = { kdsYellowMin: 8, kdsRedMin: 15, autoConfirmMinutes: 3, salonReadyMin: 5, salonUnpaidMin: 10, salonUnacceptedMin: 4 };
  it('acepta lo razonable y rechaza el ámbar después del rojo', () => {
    expect(problemaDeTiempos(base)).toBeNull();
    expect(problemaDeTiempos({ ...base, kdsYellowMin: 20 })).toBe('El rojo tiene que llegar después del ámbar.');
    expect(problemaDeTiempos({ ...base, salonReadyMin: 0 })).toMatch(/mayores que cero/);
  });

  it('dice quién confirma', () => {
    expect(estadoPedidos(false, 3).texto).toBe('Confirmas tú');
    expect(estadoPedidos(true, 3).texto).toBe('Confirma solo en 3 min');
  });
});
