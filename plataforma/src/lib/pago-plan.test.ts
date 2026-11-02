import { describe, expect, it } from 'vitest';
import { codigoDePago, hayCuenta, limpiarReferencia, rutaDeComprobanteValida } from './pago-plan';

const RID = '3f2a9c1e-7b4d-4e8a-9c11-0a1b2c3d4e5f';
const ARCHIVO = '0b9e5c2a-1d3f-4a6b-8c7d-9e0f1a2b3c4d';

describe('codigoDePago', () => {
  it('toma los seis primeros caracteres del id en mayúsculas', () => {
    expect(codigoDePago(RID)).toBe('LG-3F2A9C');
  });

  it('es estable: el mismo restaurante siempre tiene el mismo código', () => {
    expect(codigoDePago(RID)).toBe(codigoDePago(RID.toUpperCase()));
  });
});

describe('rutaDeComprobanteValida', () => {
  it('acepta la ruta propia con extensión conocida', () => {
    expect(rutaDeComprobanteValida(RID, `${RID}/${ARCHIVO}.jpg`)).toBe(true);
    expect(rutaDeComprobanteValida(RID, `${RID}/${ARCHIVO}.pdf`)).toBe(true);
  });

  it('rechaza el archivo de otro restaurante', () => {
    const otro = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(rutaDeComprobanteValida(RID, `${otro}/${ARCHIVO}.jpg`)).toBe(false);
  });

  it('rechaza saltos de carpeta y extensiones raras', () => {
    expect(rutaDeComprobanteValida(RID, `${RID}/../${ARCHIVO}.jpg`)).toBe(false);
    expect(rutaDeComprobanteValida(RID, `${RID}/${ARCHIVO}.exe`)).toBe(false);
    expect(rutaDeComprobanteValida(RID, `${RID}/sub/${ARCHIVO}.png`)).toBe(false);
  });
});

describe('limpiarReferencia', () => {
  it('quita símbolos y recorta', () => {
    expect(limpiarReferencia('  Boleta #12345<script> ')).toBe('Boleta #12345script');
    expect(limpiarReferencia('9'.repeat(60))).toHaveLength(40);
  });

  it('vacío es null', () => {
    expect(limpiarReferencia('   ')).toBeNull();
    expect(limpiarReferencia(undefined)).toBeNull();
  });
});

describe('hayCuenta', () => {
  it('pide al menos banco y número', () => {
    expect(hayCuenta({ banco: 'Banco Industrial', tipoCuenta: '', numeroCuenta: '123', titular: '' })).toBe(true);
    expect(hayCuenta({ banco: 'Banco Industrial', tipoCuenta: 'Monetaria', numeroCuenta: ' ', titular: 'X' })).toBe(false);
  });
});
