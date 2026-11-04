import { describe, expect, it } from 'vitest';
import {
  conPunto, estadoDePausa, esDuracionPausa, fraseDeRegreso, extenderPausa, finDePausa, horaDePausa, minutosRestantes, pausaVigente,
} from './pausa-pedidos';

const t = (iso: string) => new Date(iso).getTime();
const AHORA = t('2026-11-04T21:15:00Z'); // 3:15 p. m. en Guatemala

describe('estadoDePausa', () => {
  it('sin pausa: recibiendo', () => {
    expect(estadoDePausa({ orders_paused: false }, AHORA)).toEqual({ tipo: 'recibiendo' });
    expect(estadoDePausa({ orders_paused: null }, AHORA)).toEqual({ tipo: 'recibiendo' });
  });

  it('pausa sin fin (o base sin la migración 155): en pausa hasta reactivar', () => {
    expect(estadoDePausa({ orders_paused: true }, AHORA)).toEqual({ tipo: 'pausa', hasta: null });
    expect(estadoDePausa({ orders_paused: true, orders_paused_until: null }, AHORA)).toEqual({ tipo: 'pausa', hasta: null });
  });

  it('pausa con fin futuro: en pausa hasta esa hora', () => {
    const hasta = '2026-11-04T21:45:00.000Z';
    expect(estadoDePausa({ orders_paused: true, orders_paused_until: hasta }, AHORA)).toEqual({ tipo: 'pausa', hasta });
  });

  it('pausa con fin ya pasado: termina sola, sin que nadie la apague', () => {
    const hasta = '2026-11-04T21:00:00.000Z';
    expect(estadoDePausa({ orders_paused: true, orders_paused_until: hasta }, AHORA)).toEqual({ tipo: 'recibiendo', terminoEn: hasta });
    expect(pausaVigente({ orders_paused: true, orders_paused_until: hasta }, AHORA)).toBe(false);
  });

  it('el fin es exclusivo: a la hora exacta ya se reciben pedidos', () => {
    const hasta = '2026-11-04T21:45:00.000Z';
    expect(pausaVigente({ orders_paused: true, orders_paused_until: hasta }, t(hasta) - 1)).toBe(true);
    expect(pausaVigente({ orders_paused: true, orders_paused_until: hasta }, t(hasta))).toBe(false);
  });

  it('una fecha sin pausa no pausa nada', () => {
    expect(pausaVigente({ orders_paused: false, orders_paused_until: '2026-11-05T00:00:00Z' }, AHORA)).toBe(false);
  });
});

describe('duraciones', () => {
  it('solo las que ofrece el panel', () => {
    expect(esDuracionPausa(15)).toBe(true);
    expect(esDuracionPausa(0)).toBe(true);
    expect(esDuracionPausa(45)).toBe(false);
    expect(esDuracionPausa('30')).toBe(false);
  });

  it('el fin se cuenta desde ahora; 0 no tiene fin', () => {
    expect(finDePausa(30, AHORA)).toBe('2026-11-04T21:45:00.000Z');
    expect(finDePausa(60, AHORA)).toBe('2026-11-04T22:15:00.000Z');
    expect(finDePausa(0, AHORA)).toBeNull();
  });
});

describe('extenderPausa (+15 min)', () => {
  it('suma a la hora de fin si todavía no llegó', () => {
    expect(extenderPausa('2026-11-04T21:45:00.000Z', AHORA)).toBe('2026-11-04T22:00:00.000Z');
  });

  it('si la hora ya pasó, suma desde ahora (no deja una pausa en el pasado)', () => {
    expect(extenderPausa('2026-11-04T21:00:00.000Z', AHORA)).toBe('2026-11-04T21:30:00.000Z');
  });

  it('una pausa sin fin no se extiende', () => {
    expect(extenderPausa(null, AHORA)).toBeNull();
  });
});

describe('textos', () => {
  it('la hora se dice en la zona del restaurante', () => {
    expect(horaDePausa('2026-11-04T21:45:00.000Z', 'America/Guatemala')).toMatch(/^3:45/);
  });

  it('la frase de regreso termina en un solo punto («p. m.» ya trae el suyo)', () => {
    const frase = fraseDeRegreso('2026-11-04T21:45:00.000Z', 'America/Guatemala')!;
    expect(frase).toMatch(/^Volvemos a recibir pedidos a las 3:45/);
    expect(frase.endsWith('..')).toBe(false);
    expect(frase.endsWith('.')).toBe(true);
    expect(fraseDeRegreso(null, 'America/Guatemala')).toBeNull();
  });

  it('el mensaje del dueño queda con punto final para encadenar otra frase', () => {
    expect(conPunto('Estamos a tope')).toBe('Estamos a tope.');
    expect(conPunto('¡Volvemos pronto!')).toBe('¡Volvemos pronto!');
    expect(conPunto('  ')).toBe('');
  });

  it('los minutos que faltan se redondean hacia arriba', () => {
    expect(minutosRestantes('2026-11-04T21:45:00.000Z', AHORA)).toBe(30);
    expect(minutosRestantes('2026-11-04T21:15:59.000Z', AHORA)).toBe(1);
    expect(minutosRestantes('2026-11-04T21:00:00.000Z', AHORA)).toBe(0);
  });
});
