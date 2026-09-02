/* El vocabulario de la forma de pago.
   ------------------------------------------------------------------
   `countsAsCash` es la que decide si una venta tiene que estar en el
   cajón al cerrar la noche. Antes esa pregunta se contestaba con
   `payment_method !== 'CARD'`, y por eso una transferencia contaba
   como efectivo y la caja salía cuadrada de mentira. */
import { describe, it, expect } from 'vitest';
import { countsAsCash, labelOf, normalize, isPaymentMethod } from './payment-method';

describe('normalize', () => {
  it('trata lo vacío como efectivo, que es el valor de fábrica de la columna', () => {
    expect(normalize(null)).toBe('CASH');
    expect(normalize(undefined)).toBe('CASH');
    expect(normalize('   ')).toBe('CASH');
  });

  it('no se pierde por mayúsculas ni espacios', () => {
    expect(normalize(' card ')).toBe('CARD');
    expect(normalize('transfer')).toBe('TRANSFER');
  });

  it('deja pasar lo que no conoce en vez de inventar', () => {
    expect(normalize('PEDIDOSYA_ONLINE')).toBe('PEDIDOSYA_ONLINE');
  });
});

describe('countsAsCash', () => {
  it('solo el efectivo tiene que estar en el cajón', () => {
    expect(countsAsCash('CASH')).toBe(true);
    expect(countsAsCash(null)).toBe(true);
  });

  it('la tarjeta NO cuenta como efectivo', () => {
    expect(countsAsCash('CARD')).toBe(false);
  });

  it('la transferencia tampoco — este era el fallo', () => {
    // Con la comprobación vieja (`!== 'CARD'`) esto daba true y el arqueo
    // esperaba en el cajón un dinero que había entrado al banco.
    expect(countsAsCash('TRANSFER')).toBe(false);
  });

  it('un método desconocido no se cuela como efectivo', () => {
    expect(countsAsCash('PEDIDOSYA_ONLINE')).toBe(false);
  });
});

describe('labelOf', () => {
  it('nombra los tres métodos que la aplicación cobra', () => {
    expect(labelOf('CASH')).toBe('Efectivo');
    expect(labelOf('CARD')).toBe('Tarjeta');
    expect(labelOf('TRANSFER')).toBe('Transferencia');
  });

  it('un pedido viejo sin método se lee como efectivo', () => {
    expect(labelOf(null)).toBe('Efectivo');
  });

  it('lo desconocido se enseña tal cual, sin disfrazarlo de efectivo', () => {
    expect(labelOf('CUPON_INTERNO')).toBe('CUPON_INTERNO');
  });
});

describe('isPaymentMethod', () => {
  it('reconoce solo los códigos que se pueden guardar desde la aplicación', () => {
    expect(isPaymentMethod('CASH')).toBe(true);
    expect(isPaymentMethod('TRANSFER')).toBe(true);
    expect(isPaymentMethod('cash')).toBe(false);
    expect(isPaymentMethod('CHEQUE')).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
  });
});
