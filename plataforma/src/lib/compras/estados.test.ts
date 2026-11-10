import { describe, expect, it } from 'vitest';
import { mensajeDeCompra, motivoDeRechazo, puedePasar } from './estados';

describe('estados de una orden de compra', () => {
  it('permite el camino normal', () => {
    expect(puedePasar('BORRADOR', 'ENVIADA')).toBe(true);
    expect(puedePasar('ENVIADA', 'RECIBIDA')).toBe(true);
    expect(puedePasar('BORRADOR', 'RECIBIDA')).toBe(true);
    expect(puedePasar('BORRADOR', 'CANCELADA')).toBe(true);
    expect(puedePasar('ENVIADA', 'CANCELADA')).toBe(true);
  });

  it('una recibida no vuelve atrás ni se cancela (PA-T12)', () => {
    expect(puedePasar('RECIBIDA', 'BORRADOR')).toBe(false);
    expect(puedePasar('RECIBIDA', 'ENVIADA')).toBe(false);
    expect(puedePasar('RECIBIDA', 'CANCELADA')).toBe(false);
  });

  it('una cancelada es final y nada vuelve a borrador', () => {
    expect(puedePasar('CANCELADA', 'ENVIADA')).toBe(false);
    expect(puedePasar('CANCELADA', 'RECIBIDA')).toBe(false);
    expect(puedePasar('ENVIADA', 'BORRADOR')).toBe(false);
  });

  it('explica el rechazo', () => {
    expect(motivoDeRechazo('RECIBIDA', 'BORRADOR')).toMatch(/ya se recibió.*borrador/);
    expect(motivoDeRechazo('CANCELADA', 'ENVIADA')).toMatch(/cancelada.*enviada/);
    expect(motivoDeRechazo('ENVIADA', 'BORRADOR')).toBe('Una orden enviada no puede pasar a borrador.');
  });

  it('muestra los errores propios de la base y oculta los técnicos', () => {
    expect(mensajeDeCompra({ code: 'LGC03', message: 'Una compra recibida no puede pasar a borrador.' }, 'X'))
      .toBe('Una compra recibida no puede pasar a borrador.');
    expect(mensajeDeCompra({ code: '23514', message: 'El insumo no es de este restaurante.' }, 'X'))
      .toBe('El insumo no es de este restaurante.');
    expect(mensajeDeCompra({ code: '08006', message: 'connection failure' }, 'No se pudo.')).toBe('No se pudo.');
    expect(mensajeDeCompra(null, 'No se pudo.')).toBe('No se pudo.');
  });
});
