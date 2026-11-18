import { describe, expect, it } from 'vitest';
import { base32ABytes, codigoTotp } from './totp';

/* Vectores del RFC 6238 (apéndice B), SHA-1, clave «12345678901234567890». */
const CLAVE = Buffer.from('12345678901234567890', 'ascii');

describe('codigoTotp', () => {
  it('da los códigos del RFC 6238 con 8 cifras', () => {
    expect(codigoTotp(CLAVE, 59_000, 8)).toBe('94287082');
    expect(codigoTotp(CLAVE, 1_111_111_109_000, 8)).toBe('07081804');
    expect(codigoTotp(CLAVE, 1_234_567_890_000, 8)).toBe('89005924');
    expect(codigoTotp(CLAVE, 20_000_000_000_000, 8)).toBe('65353130');
  });

  it('con 6 cifras son las últimas seis', () => {
    expect(codigoTotp(CLAVE, 59_000)).toBe('287082');
  });
});

describe('base32ABytes', () => {
  it('decodifica la clave del RFC escrita en base32', () => {
    expect(base32ABytes('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(CLAVE)).toBe(true);
  });

  it('rechaza letras que no son base32', () => {
    expect(() => base32ABytes('ABC1')).toThrow();
  });
});
