import { describe, expect, it } from 'vitest';
import {
  digitoVerificadorNit,
  esNitValido,
  esCuiValido,
  interpretarReceptorId,
  receptorExtranjero,
  explicarIdInvalido,
  limpiar,
} from './nit';

/* ── Contexto ─────────────────────────────────────────────────────
   Estas pruebas existen porque el certificador NO protege de esto: un
   NIT ajeno pero bien formado se certifica sin queja, y la factura queda
   a nombre de otro contribuyente. Aquí se atrapa antes de salir. */

describe('dígito verificador del NIT (módulo 11)', () => {
  it('calcula el verificador de un NIT real', () => {
    expect(digitoVerificadorNit('3602978')).toBe('5');
  });

  it('devuelve K cuando el resto da 10', () => {
    // El caso raro que un regex nunca atraparía: K vale 10 en módulo 11.
    expect(digitoVerificadorNit('6')).toBe('K');
    expect(digitoVerificadorNit('23')).toBe('K');
    expect(esNitValido('6-K')).toBe(true);
    expect(esNitValido('23K')).toBe(true);
  });

  it('devuelve 0 cuando el resto es 0 (11 se escribe 0, no 11)', () => {
    const cero = Array.from({ length: 500 }, (_, i) => String(i + 1))
      .find((c) => digitoVerificadorNit(c) === '0');
    expect(cero).toBeDefined();
    expect(esNitValido(`${cero}0`)).toBe(true);
  });

  it('rechaza cuerpos que no son numéricos', () => {
    expect(digitoVerificadorNit('12A4')).toBeNull();
    expect(digitoVerificadorNit('')).toBeNull();
  });
});

describe('esNitValido', () => {
  it('acepta un NIT correcto con y sin guion', () => {
    expect(esNitValido('3602978-5')).toBe(true);
    expect(esNitValido('36029785')).toBe(true);
    expect(esNitValido(' 3602978 5 ')).toBe(true);
  });

  it('rechaza un dígito verificador equivocado', () => {
    // El error más común de tecleo: el cuerpo bien, el verificador mal.
    expect(esNitValido('3602978-6')).toBe(false);
  });

  it('rechaza una transposición de dígitos', () => {
    // 3602978 → 3609278. Sin verificador esto pasaría como NIT válido.
    expect(esNitValido('3609278-5')).toBe(false);
  });

  it('rechaza el NIT de ejemplo que traía el formulario', () => {
    // 1234567K se usaba como placeholder en la UI y no es un NIT real.
    expect(esNitValido('1234567K')).toBe(false);
    expect(digitoVerificadorNit('1234567')).toBe('9');
  });

  it('rechaza texto y NIT vacío', () => {
    expect(esNitValido('')).toBe(false);
    expect(esNitValido('CF')).toBe(false);
    expect(esNitValido('ABC123')).toBe(false);
  });
});

describe('esCuiValido', () => {
  it('exige exactamente 13 dígitos', () => {
    expect(esCuiValido('123456789012')).toBe(false);
    expect(esCuiValido('12345678901234')).toBe(false);
  });

  it('rechaza un departamento fuera de 01–22', () => {
    // Se construye un CUI con verificador correcto pero departamento 99.
    const correlativo = '12345678';
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
    const dv = suma % 11;
    expect(esCuiValido(`${correlativo}${dv}9901`)).toBe(false);
    expect(esCuiValido(`${correlativo}${dv}0101`)).toBe(true);
  });

  it('rechaza municipio 00', () => {
    const correlativo = '12345678';
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
    expect(esCuiValido(`${correlativo}${suma % 11}0100`)).toBe(false);
  });

  it('rechaza un verificador equivocado', () => {
    const correlativo = '12345678';
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
    const malo = (suma % 11 + 1) % 10;
    expect(esCuiValido(`${correlativo}${malo}0101`)).toBe(false);
  });
});

describe('interpretarReceptorId', () => {
  it('vacío y CF son consumidor final', () => {
    expect(interpretarReceptorId('')).toEqual({ tipo: 'CF', valor: 'CF' });
    expect(interpretarReceptorId('cf')).toEqual({ tipo: 'CF', valor: 'CF' });
    expect(interpretarReceptorId(' C F ')).toEqual({ tipo: 'CF', valor: 'CF' });
  });

  it('reconoce un NIT', () => {
    expect(interpretarReceptorId('3602978-5')).toEqual({ tipo: 'NIT', valor: '36029785' });
  });

  it('reconoce un CUI de 13 dígitos válido', () => {
    const correlativo = '12345678';
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
    const cui = `${correlativo}${suma % 11}0101`;
    expect(interpretarReceptorId(cui)).toEqual({ tipo: 'CUI', valor: cui });
  });

  it('devuelve null cuando no es nada reconocible', () => {
    expect(interpretarReceptorId('3602978-6')).toBeNull();
    expect(interpretarReceptorId('hola')).toBeNull();
  });
});

describe('receptorExtranjero', () => {
  it('acepta un pasaporte razonable', () => {
    expect(receptorExtranjero('AB1234567')).toEqual({ tipo: 'EXT', valor: 'AB1234567' });
  });

  it('rechaza vacío o demasiado corto', () => {
    expect(receptorExtranjero('')).toBeNull();
    expect(receptorExtranjero('AB')).toBeNull();
  });
});

describe('explicarIdInvalido', () => {
  it('dice cuál sería el verificador correcto', () => {
    const msg = explicarIdInvalido('3602978-6');
    expect(msg).toContain('3602978');
    expect(msg).toContain('5');
  });

  it('orienta cuando el campo va vacío', () => {
    expect(explicarIdInvalido('')).toContain('CF');
  });

  it('distingue el caso del DPI', () => {
    expect(explicarIdInvalido('1234567890123')).toContain('DPI');
  });
});

describe('limpiar', () => {
  it('quita guiones, puntos y espacios y sube a mayúsculas', () => {
    expect(limpiar(' 36.029-78 5 ')).toBe('36029785');
    expect(limpiar('1234k')).toBe('1234K');
  });
});
