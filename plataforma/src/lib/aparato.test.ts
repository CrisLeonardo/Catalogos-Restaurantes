import { describe, expect, it } from 'vitest';
import { destinoDelAparato, leerUso, USOS } from './aparato';

describe('el uso del aparato', () => {
  it('solo acepta los tres usos; lo demás es panel completo', () => {
    expect(leerUso('cocina')).toBe('cocina');
    expect(leerUso('dueno')).toBeNull();
    expect(leerUso(null)).toBeNull();
  });

  it('abre la pantalla del aparato a quien la tiene en su menú', () => {
    const menu = new Set(['/admin', '/admin/cocina', '/admin/pedidos']);
    expect(destinoDelAparato('cocina', menu)).toBe(USOS.cocina.ruta);
  });

  it('recordar la pantalla nunca amplía permisos', () => {
    const mesero = new Set(['/admin/mesero']);
    expect(destinoDelAparato('caja', mesero)).toBeNull();
    expect(destinoDelAparato(null, mesero)).toBeNull();
  });
});
