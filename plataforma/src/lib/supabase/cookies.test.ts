import { describe, it, expect } from 'vitest';
import {
  DINER_COOKIE_NAME,
  duplicateCookieNames,
  isCodeVerifierCookie,
  isDeadSessionCode,
  isStaffCodeVerifierCookie,
  isStaffSessionCookie,
  isWalletCodeVerifierCookie,
  cookieDomainForHost,
  WALLET_COOKIE_NAME,
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

  it('deja fuera la de la cuenta Leogin (billetera)', () => {
    // Si contara como del personal, el bloque de la cookie fantasma del
    // proxy la expiraría cada vez que la sesión del panel saliera muerta.
    expect(isStaffSessionCookie(WALLET_COOKIE_NAME)).toBe(false);
    expect(isStaffSessionCookie(`${WALLET_COOKIE_NAME}.0`)).toBe(false);
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

describe('verificador PKCE de cada sesión', () => {
  it('el de la billetera no se toma por un login del personal', () => {
    // Si se tomara, un `code` de la billetera que cae en la portada se
    // mandaría al callback del PANEL (proxy.ts §1c).
    const billetera = `${WALLET_COOKIE_NAME}-code-verifier`;
    expect(isStaffCodeVerifierCookie(billetera)).toBe(false);
    expect(isWalletCodeVerifierCookie(billetera)).toBe(true);
  });

  it('el del personal y el del comensal no son de la billetera', () => {
    expect(isStaffCodeVerifierCookie('sb-abcdef-auth-token-code-verifier')).toBe(true);
    expect(isWalletCodeVerifierCookie('sb-abcdef-auth-token-code-verifier')).toBe(false);
    expect(isWalletCodeVerifierCookie(`${DINER_COOKIE_NAME}-code-verifier`)).toBe(false);
    expect(isWalletCodeVerifierCookie(WALLET_COOKIE_NAME)).toBe(false);
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

describe('cookieDomainForHost', () => {
  const ROOTS = 'distleogin.com,leogin.online';

  it('comparte la sesión entre subdominios del dominio configurado', () => {
    expect(cookieDomainForHost('distleogin.com', ROOTS)).toBe('.distleogin.com');
    expect(cookieDomainForHost('demo-admin.distleogin.com', ROOTS)).toBe('.distleogin.com');
    expect(cookieDomainForHost('demo-central.distleogin.com:443', ROOTS)).toBe('.distleogin.com');
  });

  it('reconoce cada dominio de la lista, no solo el primero', () => {
    expect(cookieDomainForHost('algo.leogin.online', ROOTS)).toBe('.leogin.online');
  });

  it('en un host ajeno escribe host-only en vez de una cookie imposible', () => {
    // El caso que rompía el acceso con Google: el navegador RECHAZA una
    // cookie con Domain=.distleogin.com servida desde otro dominio, sin
    // decir nada. No se guardaba ni la sesión ni el verificador PKCE.
    expect(cookieDomainForHost('catalogos-restaurantes.onrender.com', ROOTS)).toBeUndefined();
    expect(cookieDomainForHost('mi-previa.vercel.app', ROOTS)).toBeUndefined();
  });

  it('no se deja engañar por un dominio que solo TERMINA parecido', () => {
    expect(cookieDomainForHost('maldistleogin.com', ROOTS)).toBeUndefined();
  });

  it('en local no fuerza dominio', () => {
    expect(cookieDomainForHost('demo-admin.localhost', 'localhost:3000')).toBeUndefined();
  });

  it('sin configuración, host-only', () => {
    expect(cookieDomainForHost('distleogin.com', '')).toBeUndefined();
    expect(cookieDomainForHost(null, ROOTS)).toBeUndefined();
  });
});
