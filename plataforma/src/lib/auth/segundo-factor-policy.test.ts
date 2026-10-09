import { describe, expect, it } from 'vitest';
import {
  aalDelToken,
  esCodigoValido,
  exigeSegundoFactor,
  pasoSegundoFactor,
} from './segundo-factor-policy';

/** Un JWT de mentira con el payload dado (la firma no se mira). */
function token(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.firma`;
}

const superAdmin = { app_metadata: { requiere_segundo_factor: true }, factors: [] };
const superConApp = {
  app_metadata: { requiere_segundo_factor: true },
  factors: [{ status: 'verified', factor_type: 'totp' }],
};
const dueño = { app_metadata: { provider: 'email' }, factors: [] };

describe('exigeSegundoFactor', () => {
  it('el Super Admin (por la marca) sí, aunque aún no tenga app', () => {
    expect(exigeSegundoFactor(superAdmin)).toBe(true);
  });

  it('un dueño normal no', () => {
    expect(exigeSegundoFactor(dueño)).toBe(false);
    expect(exigeSegundoFactor({})).toBe(false);
  });

  it('quien ya tiene un factor verificado sí, aunque no lleve la marca', () => {
    expect(exigeSegundoFactor({ factors: [{ status: 'verified' }] })).toBe(true);
  });

  it('un factor a medio inscribir no cuenta', () => {
    expect(exigeSegundoFactor({ factors: [{ status: 'unverified' }] })).toBe(false);
  });

  it('la marca tiene que ser true de verdad, no un texto', () => {
    expect(exigeSegundoFactor({ app_metadata: { requiere_segundo_factor: 'true' } })).toBe(false);
  });
});

describe('pasoSegundoFactor', () => {
  it('Super Admin sin app → inscribir', () => {
    expect(pasoSegundoFactor(superAdmin, 'aal1')).toBe('inscribir');
  });

  it('Super Admin con app y sesión aal1 → verificar', () => {
    expect(pasoSegundoFactor(superConApp, 'aal1')).toBe('verificar');
  });

  it('Super Admin con el código ya puesto → listo', () => {
    expect(pasoSegundoFactor(superConApp, 'aal2')).toBe('listo');
  });

  it('sin nivel legible cuenta como no verificado', () => {
    expect(pasoSegundoFactor(superConApp, null)).toBe('verificar');
  });

  it('a un dueño no se le pide nada, sea cual sea el nivel', () => {
    expect(pasoSegundoFactor(dueño, 'aal1')).toBe('listo');
    expect(pasoSegundoFactor(dueño, null)).toBe('listo');
  });
});

describe('aalDelToken', () => {
  it('lee aal2', () => {
    expect(aalDelToken(token({ aal: 'aal2' }))).toBe('aal2');
  });

  it('lee aal1', () => {
    expect(aalDelToken(token({ aal: 'aal1' }))).toBe('aal1');
  });

  it('cualquier otra cosa cuenta como aal1, nunca como aal2', () => {
    expect(aalDelToken(token({}))).toBe('aal1');
    expect(aalDelToken(token({ aal: 'AAL2' }))).toBe('aal1');
    expect(aalDelToken('no-es-un-jwt')).toBe('aal1');
    expect(aalDelToken('a.%%%.c')).toBe('aal1');
  });

  it('sin token no hay nivel', () => {
    expect(aalDelToken(null)).toBe(null);
    expect(aalDelToken('')).toBe(null);
  });
});

describe('esCodigoValido', () => {
  it('6 cifras', () => {
    expect(esCodigoValido('012345')).toBe(true);
    expect(esCodigoValido('12345')).toBe(false);
    expect(esCodigoValido('1234567')).toBe(false);
    expect(esCodigoValido('12 345')).toBe(false);
    expect(esCodigoValido('abcdef')).toBe(false);
  });
});
