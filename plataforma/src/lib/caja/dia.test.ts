import { describe, expect, it } from 'vitest';
import { rangoDelCierre } from './dia';

const TZ = 'America/Guatemala'; // UTC−6, sin horario de verano

describe('CAJA-02 · el recibo separa el día de caja del turno', () => {
  it('un turno abierto a las 10:27 no se presenta como «de 05:00»', () => {
    expect(rangoDelCierre({
      openedAt: '2026-11-25T16:27:00Z', periodStart: '2026-11-25T11:00:00Z', closedAt: '2026-11-25T16:28:00Z',
    }, TZ)).toBe('turno de 10:27 a 10:28');
  });
  it('sin apertura dice desde cuándo cuenta', () => {
    expect(rangoDelCierre({
      openedAt: null, periodStart: '2026-11-25T11:00:00Z', closedAt: '2026-11-25T16:28:00Z',
    }, TZ)).toBe('sin apertura · cuenta desde las 05:00 hasta las 10:28');
  });
  it('un turno que cruza medianoche lo dice', () => {
    expect(rangoDelCierre({
      openedAt: '2026-11-26T04:10:00Z', periodStart: '2026-11-25T11:00:00Z', closedAt: '2026-11-26T07:30:00Z',
    }, TZ)).toBe('turno de 22:10 a 01:30 del día siguiente');
  });
});
