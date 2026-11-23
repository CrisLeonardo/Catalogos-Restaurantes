import { describe, expect, it } from 'vitest';
import { avisoDePrecios, preciosCambiados } from './precios-carrito';

const q = (n: number) => `Q${n.toFixed(2)}`;

describe('precio que cambia con el carrito abierto (OP-02)', () => {
  it('sin cambios no avisa nada', () => {
    expect(preciosCambiados([{ name: 'Café', price: 15 }], [{ price: 15 }])).toEqual([]);
  });
  it('ignora el ruido de coma flotante, no los centavos', () => {
    expect(preciosCambiados([{ name: 'Café', price: 15.1 }], [{ price: 15.100000001 }])).toEqual([]);
    expect(preciosCambiados([{ name: 'Café', price: 15.1 }], [{ price: 15.11 }])).toHaveLength(1);
  });
  it('detecta una subida y dice el precio nuevo', () => {
    const c = preciosCambiados([{ name: 'Café', price: 15 }, { name: 'Pan', price: 12.5 }], [{ price: 15 }, { price: 14 }]);
    expect(c).toEqual([{ indice: 1, nombre: 'Pan', antes: 12.5, ahora: 14 }]);
    expect(avisoDePrecios(c, q)).toBe('Cambió el precio de «Pan»: ahora cuesta Q14.00. Ya actualizamos tu carrito; revisa el total y vuelve a enviar.');
  });
  it('también avisa si bajó: el total que vio ya no es el real', () => {
    expect(preciosCambiados([{ name: 'Café', price: 15 }], [{ price: 12 }])).toHaveLength(1);
  });
  it('con varios cambios los nombra todos', () => {
    const c = preciosCambiados([{ name: 'A', price: 1 }, { name: 'B', price: 2 }], [{ price: 3 }, { price: 4 }]);
    expect(avisoDePrecios(c, q)).toContain('«A», «B»');
  });
});
