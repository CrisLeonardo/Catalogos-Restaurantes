import { describe, expect, it } from 'vitest';
import { aceptaTransferencia, limpiarCuenta, rutaComprobantePedidoValida } from './pago-transferencia';

const RID = '3f2a9c1e-7b4d-4e8a-9c11-0a1b2c3d4e5f';
const ARCHIVO = '0b9e5c2a-1d3f-4a6b-8c7d-9e0f1a2b3c4d';

describe('aceptaTransferencia', () => {
  const cuenta = { transferBank: 'Banrural', transferAccountNumber: '123-456' };
  it('pide el interruptor y la cuenta', () => {
    expect(aceptaTransferencia({ acceptsTransfer: true, ...cuenta })).toBe(true);
    expect(aceptaTransferencia({ acceptsTransfer: false, ...cuenta })).toBe(false);
    expect(aceptaTransferencia({ acceptsTransfer: true, transferBank: 'Banrural', transferAccountNumber: '' })).toBe(false);
  });
});

describe('limpiarCuenta', () => {
  it('recorta espacios y deja solo dígitos y guiones en el número', () => {
    expect(limpiarCuenta({ acceptsTransfer: true, transferBank: '  Banco   Industrial ', transferAccountNumber: '3-0 12abc' })).toEqual({
      acceptsTransfer: true, transferBank: 'Banco Industrial', transferAccountType: '', transferAccountNumber: '3-0 12', transferAccountHolder: '',
    });
  });
});

describe('rutaComprobantePedidoValida', () => {
  it('solo bajo pedidos/ del propio restaurante', () => {
    expect(rutaComprobantePedidoValida(RID, `pedidos/${RID}/${ARCHIVO}.jpg`)).toBe(true);
    expect(rutaComprobantePedidoValida(RID, `${RID}/${ARCHIVO}.jpg`)).toBe(false);
    expect(rutaComprobantePedidoValida(RID, `pedidos/otro/${ARCHIVO}.jpg`)).toBe(false);
    expect(rutaComprobantePedidoValida(RID, `pedidos/${RID}/${ARCHIVO}.svg`)).toBe(false);
  });
});
