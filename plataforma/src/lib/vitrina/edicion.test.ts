import { describe, expect, it } from 'vitest';
import { duracionCorta, edicionPermitePedir, enlaceAvisame, estadoEdicion, motivoSinPedidos } from './edicion';

const abre = '2026-10-18T18:00:00.000Z';
const cierra = '2026-10-20T18:00:00.000Z';
const t = (iso: string) => new Date(iso).getTime();

describe('estadoEdicion', () => {
  it('sin modo lanzamiento siempre deja pedir', () => {
    const e = estadoEdicion({ launchMode: false, launchOpensAt: abre, launchEndsAt: cierra }, t('2026-10-25T00:00:00Z'));
    expect(e.estado).toBe('sin');
    expect(edicionPermitePedir(e)).toBe(true);
  });

  it('antes de abrir es «próxima» y no deja pedir', () => {
    const e = estadoEdicion({ launchMode: true, launchOpensAt: abre, launchEndsAt: cierra }, t('2026-10-18T17:59:59Z'));
    expect(e.estado).toBe('proxima');
    expect(edicionPermitePedir(e)).toBe(false);
  });

  it('entre apertura y cierre está abierta', () => {
    expect(estadoEdicion({ launchMode: true, launchOpensAt: abre, launchEndsAt: cierra }, t('2026-10-18T18:00:00Z')).estado).toBe('abierta');
  });

  it('desde la hora de cierre está cerrada', () => {
    const e = estadoEdicion({ launchMode: true, launchOpensAt: abre, launchEndsAt: cierra }, t(cierra));
    expect(e.estado).toBe('cerrada');
    expect(edicionPermitePedir(e)).toBe(false);
  });

  it('sin fechas el lanzamiento queda abierto', () => {
    expect(estadoEdicion({ launchMode: true, launchOpensAt: null, launchEndsAt: '' }, Date.now()).estado).toBe('abierta');
  });
});

describe('textos', () => {
  it('duracionCorta', () => {
    expect(duracionCorta(45 * 60_000)).toBe('45 min');
    expect(duracionCorta((3 * 60 + 12) * 60_000)).toBe('3 h 12 min');
    expect(duracionCorta(52 * 3_600_000)).toBe('2 d 4 h');
  });

  it('motivoSinPedidos dice cuándo abre o que ya cerró', () => {
    const proxima = estadoEdicion({ launchMode: true, launchOpensAt: abre }, t('2026-10-17T00:00:00Z'));
    expect(motivoSinPedidos(proxima, '', 'America/Guatemala')).toMatch(/^Esta edición abre el dom, 18 oct, 12:00\.$/);
    const cerrada = estadoEdicion({ launchMode: true, launchEndsAt: cierra }, t('2026-10-21T00:00:00Z'));
    expect(motivoSinPedidos(cerrada, 'Se acabó el Drop 007')).toBe('Se acabó el Drop 007');
  });

  it('enlaceAvisame arma el wa.me con el mensaje', () => {
    expect(enlaceAvisame('+502 5555-1234', 'Drop 008')).toBe(
      'https://wa.me/50255551234?text=' + encodeURIComponent('Hola, avísame cuando salga Drop 008.'),
    );
    expect(enlaceAvisame(null, 'Drop 008')).toBeNull();
  });
});
