import { describe, expect, it } from 'vitest';
import { msDeVentana, tipoDeVentana, VENTANA_CORTA_MS, VENTANA_LARGA_MS } from './session-window';

describe('tipoDeVentana', () => {
  it('el dueño en su celular: sesión larga', () => {
    expect(tipoDeVentana({ role: 'RESTAURANT_OWNER', aparatoDelLocal: false })).toBe('larga');
  });

  it('el dueño en la tablet del local: 30 min, como antes', () => {
    expect(tipoDeVentana({ role: 'RESTAURANT_OWNER', aparatoDelLocal: true })).toBe('corta');
  });

  it('el gerente con usuario en su casa: larga', () => {
    expect(tipoDeVentana({ role: 'RESTAURANT_STAFF', aparatoDelLocal: false })).toBe('larga');
  });

  it('el Super Admin: siempre corta, sea el aparato que sea', () => {
    expect(tipoDeVentana({ role: 'SUPER_ADMIN', aparatoDelLocal: false })).toBe('corta');
    expect(tipoDeVentana({ role: 'SUPER_ADMIN', aparatoDelLocal: true })).toBe('corta');
  });

  it('sin rol legible no se le da la larga por descuido… salvo fuera del local', () => {
    expect(tipoDeVentana({ role: null, aparatoDelLocal: true })).toBe('corta');
  });
});

describe('msDeVentana', () => {
  it('30 min y 7 días', () => {
    expect(msDeVentana('corta')).toBe(VENTANA_CORTA_MS);
    expect(msDeVentana('larga')).toBe(VENTANA_LARGA_MS);
    expect(VENTANA_LARGA_MS).toBe(7 * 24 * 3600 * 1000);
  });
});
