import { describe, expect, it } from 'vitest';
import { autenticadoEnMs, esReciente, pideReauth, reauthRequerida, REAUTH_VENTANA_MS } from './reauth-policy';

function token(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.firma`;
}

describe('autenticadoEnMs', () => {
  it('toma la marca MÁS reciente del amr (contraseña y luego código de la app)', () => {
    const t = token({ amr: [{ method: 'password', timestamp: 1000 }, { method: 'totp', timestamp: 1500 }] });
    expect(autenticadoEnMs(t)).toBe(1_500_000);
  });

  it('sin amr, o ilegible: null', () => {
    expect(autenticadoEnMs(token({}))).toBeNull();
    expect(autenticadoEnMs(token({ amr: [{ method: 'password' }] }))).toBeNull();
    expect(autenticadoEnMs('basura')).toBeNull();
    expect(autenticadoEnMs(null)).toBeNull();
  });
});

describe('esReciente', () => {
  const ahora = 10_000_000_000;

  it('hace 2 minutos: sí', () => {
    expect(esReciente(ahora - 2 * 60_000, ahora)).toBe(true);
  });

  it('justo en el borde: sí; un segundo después: no', () => {
    expect(esReciente(ahora - REAUTH_VENTANA_MS, ahora)).toBe(true);
    expect(esReciente(ahora - REAUTH_VENTANA_MS - 1000, ahora)).toBe(false);
  });

  it('una marca del futuro (más de un minuto de desfase) no cuenta', () => {
    expect(esReciente(ahora + 5 * 60_000, ahora)).toBe(false);
    expect(esReciente(ahora + 30_000, ahora)).toBe(true);
  });

  it('sin marca: no', () => {
    expect(esReciente(null, ahora)).toBe(false);
  });
});

describe('pideReauth', () => {
  it('reconoce el error de las acciones', () => {
    expect(pideReauth(reauthRequerida())).toBe(true);
    expect(pideReauth({ error: 'otro' })).toBe(false);
    expect(pideReauth({ reauth: 'true' })).toBe(false);
    expect(pideReauth(null)).toBe(false);
    expect(pideReauth(undefined)).toBe(false);
  });
});
