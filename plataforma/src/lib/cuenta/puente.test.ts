import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashCodigo, nuevoCodigo } from './puente-codigo';
import {
  esCodigoValido,
  urlDeCanje,
  urlDelPuente,
  urlSinPuente,
  viaSegura,
  vueltaSegura,
} from './puente';

const ROOT_ORIGINAL = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
beforeEach(() => { process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'distleogin.com'; });
afterEach(() => { process.env.NEXT_PUBLIC_ROOT_DOMAIN = ROOT_ORIGINAL; });

describe('código del puente', () => {
  it('cada código es nuevo y tiene la forma que se acepta', () => {
    const a = nuevoCodigo();
    const b = nuevoCodigo();
    expect(a).not.toBe(b);
    expect(esCodigoValido(a)).toBe(true);
  });

  it('el hash es estable y no se parece al código', () => {
    const c = nuevoCodigo();
    expect(hashCodigo(c)).toBe(hashCodigo(c));
    expect(hashCodigo(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCodigo(c)).not.toContain(c);
  });

  it('rechaza lo que no es un código', () => {
    expect(esCodigoValido(null)).toBe(false);
    expect(esCodigoValido('')).toBe(false);
    expect(esCodigoValido('corto')).toBe(false);
    expect(esCodigoValido(`${'a'.repeat(42)}=`)).toBe(false);
    expect(esCodigoValido(`${'a'.repeat(42)}'`)).toBe(false);
  });
});

describe('vueltaSegura', () => {
  it('deja pasar rutas del mismo restaurante', () => {
    expect(vueltaSegura('/')).toBe('/');
    expect(vueltaSegura('/checkout?mesa=4')).toBe('/checkout?mesa=4');
  });

  it('corta cualquier salida a otro sitio', () => {
    expect(vueltaSegura('https://malo.com')).toBe('/');
    expect(vueltaSegura('//malo.com')).toBe('/');
    expect(vueltaSegura('/\\malo.com')).toBe('/');
    expect(vueltaSegura('/a\\b')).toBe('/');
    expect(vueltaSegura('/a\nb')).toBe('/');
    expect(vueltaSegura('javascript:alert(1)')).toBe('/');
    expect(vueltaSegura(`/${'a'.repeat(600)}`)).toBe('/');
    expect(vueltaSegura(null)).toBe('/');
  });
});

describe('a dónde se manda', () => {
  it('por subdominio', () => {
    expect(urlDeCanje('rincon', 'sub', 'COD')).toBe('https://rincon.distleogin.com/auth/puente?codigo=COD');
    expect(urlSinPuente('rincon', 'sub', '/checkout')).toBe('https://rincon.distleogin.com/checkout');
  });

  it('por el link estable, para no salir de la PWA', () => {
    expect(urlDeCanje('rincon', 'm', 'COD')).toBe('https://distleogin.com/m/rincon/auth/puente?codigo=COD');
    expect(urlSinPuente('rincon', 'm', '/')).toBe('https://distleogin.com/m/rincon');
    expect(urlSinPuente('rincon', 'm', '//malo.com')).toBe('https://distleogin.com/m/rincon');
  });

  it('la dirección del puente lleva la vuelta ya saneada', () => {
    const url = new URL(urlDelPuente('rincon', 'm', '//malo.com'));
    expect(url.origin).toBe('https://distleogin.com');
    expect(url.pathname).toBe('/billetera/puente');
    expect(url.searchParams.get('r')).toBe('rincon');
    expect(url.searchParams.get('via')).toBe('m');
    expect(url.searchParams.get('vuelta')).toBe('/');
  });

  it('cualquier vía desconocida es el subdominio', () => {
    expect(viaSegura('m')).toBe('m');
    expect(viaSegura('otra')).toBe('sub');
    expect(viaSegura(null)).toBe('sub');
  });
});
