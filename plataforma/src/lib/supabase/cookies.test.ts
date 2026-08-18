import { describe, it, expect } from 'vitest';
import {
  DINER_COOKIE_NAME,
  duplicateCookieNames,
  isCodeVerifierCookie,
  isDeadSessionCode,
  isStaffSessionCookie,
} from './cookies';

describe('duplicateCookieNames', () => {
  it('encuentra la cookie fantasma: el mismo nombre dos veces', () => {
    // Lo que manda un navegador que tiene la host-only vieja Y la de
    // dominio ancho de ahora. Es indistinguible mirando `request.cookies`:
    // ahí ya solo queda una de las dos.
    const header = 'sb-abc-auth-token=VIEJA; otra=1; sb-abc-auth-token=NUEVA';
    expect(duplicateCookieNames(header)).toEqual(['sb-abc-auth-token']);
  });

  it('también con la sesión partida en trozos', () => {
    const header = 'sb-abc-auth-token.0=A; sb-abc-auth-token.1=B; sb-abc-auth-token.0=C';
    expect(duplicateCookieNames(header)).toEqual(['sb-abc-auth-token.0']);
  });

  it('no inventa duplicados donde no los hay', () => {
    expect(duplicateCookieNames('a=1; b=2; c=3')).toEqual([]);
    expect(duplicateCookieNames('')).toEqual([]);
    expect(duplicateCookieNames(null)).toEqual([]);
    expect(duplicateCookieNames(undefined)).toEqual([]);
  });

  it('no se confunde con valores que llevan "=" dentro', () => {
    // Los valores en base64url terminan en "=" de relleno más de una vez.
    const header = 'sb-abc-auth-token=base64-eyJhIjoxfQ==; sb-abc-auth-token=otra==';
    expect(duplicateCookieNames(header)).toEqual(['sb-abc-auth-token']);
  });

  it('aguanta una cabecera con basura sin nombre', () => {
    expect(duplicateCookieNames('; ; a=1; ;a=2')).toEqual(['a']);
  });
});

describe('isStaffSessionCookie', () => {
  it('reconoce la del personal y sus trozos', () => {
    expect(isStaffSessionCookie('sb-abcdef-auth-token')).toBe(true);
    expect(isStaffSessionCookie('sb-abcdef-auth-token.0')).toBe(true);
  });

  it('deja fuera la del comensal, que también empieza por sb-', () => {
    // Borrar esta por error cerraría la sesión de Google de los clientes
    // del menú, que no tiene nada que ver con el panel.
    expect(isStaffSessionCookie(DINER_COOKIE_NAME)).toBe(false);
    expect(isStaffSessionCookie(`${DINER_COOKIE_NAME}.1`)).toBe(false);
    expect(isStaffSessionCookie('sb-leogin-diner')).toBe(false);   // v1
    expect(isStaffSessionCookie('sb-leogin-diner.0')).toBe(false); // v1 troceada
  });

  it('deja fuera el verificador PKCE', () => {
    // Es la pieza que hace falta para terminar un login con Google: si el
    // proxy la borra a mitad del viaje, el callback no puede canjear el code.
    expect(isStaffSessionCookie('sb-abcdef-auth-token-code-verifier')).toBe(false);
  });

  it('no toca cookies que no son de Supabase', () => {
    expect(isStaffSessionCookie('leogin_entry')).toBe(false);
    expect(isStaffSessionCookie('theme')).toBe(false);
  });
});

describe('isCodeVerifierCookie', () => {
  it('reconoce el verificador de las dos sesiones', () => {
    expect(isCodeVerifierCookie('sb-abcdef-auth-token-code-verifier')).toBe(true);
    expect(isCodeVerifierCookie(`${DINER_COOKIE_NAME}-code-verifier`)).toBe(true);
  });

  it('no confunde la sesión con el verificador', () => {
    expect(isCodeVerifierCookie('sb-abcdef-auth-token')).toBe(false);
  });
});

describe('isDeadSessionCode', () => {
  it('reconoce las tres formas de "esta sesión ya no existe"', () => {
    expect(isDeadSessionCode('refresh_token_not_found')).toBe(true);
    expect(isDeadSessionCode('refresh_token_already_used')).toBe(true);
    expect(isDeadSessionCode('session_not_found')).toBe(true);
  });

  it('no da por muerta una sesión por un fallo pasajero', () => {
    // Si Supabase no contesta, la sesión del navegador sigue siendo buena:
    // darla por muerta aquí cerraría sesiones sanas en cada microcorte.
    expect(isDeadSessionCode('over_request_rate_limit')).toBe(false);
    expect(isDeadSessionCode(undefined)).toBe(false);
    expect(isDeadSessionCode(null)).toBe(false);
    expect(isDeadSessionCode('')).toBe(false);
  });
});
