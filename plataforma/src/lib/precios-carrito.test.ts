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

const centavosBase = [
  100, 101, 110, 125, 199, 249, 499, 999, 1_000, 1_101,
  1_210, 1_499, 1_500, 1_501, 1_699, 2_349, 2_998, 2_999, 3_000, 4_500,
  4_959, 5_500, 7_900, 9_899, 9_900, 9_999, 10_000, 15_000, 29_999, 100_000,
];
const movimientos = [-99, -50, -10, -2, -1, 1, 2, 10, 50, 99];
const platillos = ['Café', 'Pan', 'Tostada', 'Caldo'];

describe('matriz de precios de lanzamiento', () => {
  it.each(centavosBase)('comprueba las 160 combinaciones con base de %i centavos', (base) => {
    for (const movimiento of movimientos) {
      for (let mascara = 0; mascara < 2 ** platillos.length; mascara++) {
        const escenario = `base ${base}, cambio ${movimiento}, líneas ${mascara.toString(2)}`;
        const vistos = platillos.map((name, indice) => ({ name, price: (base + indice) / 100 }));
        const esperados = vistos.flatMap(({ name, price }, indice) => {
          if ((mascara & (1 << indice)) === 0) return [];
          return [{ indice, nombre: name, antes: price, ahora: (base + indice + movimiento) / 100 }];
        });
        const vigentes = vistos.map(({ price }, indice) => ({
          price: esperados.find((cambio) => cambio.indice === indice)?.ahora ?? price + 1e-9,
        }));

        const cambios = preciosCambiados(vistos, vigentes);
        expect(cambios, escenario).toEqual(esperados);
        const aviso = avisoDePrecios(cambios, q);
        if (esperados.length === 0) expect(aviso, escenario).toBe('');
        for (const cambio of esperados) expect(aviso, escenario).toContain(`«${cambio.nombre}»`);
      }
    }
  });
});
