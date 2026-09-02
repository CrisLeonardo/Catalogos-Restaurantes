/**
 * La mesa deja de ser una cadena de texto (F-12).
 *
 * Lo que se prueba aquí es la única pieza que queda sabiendo que hubo dos
 * formas de saber de qué mesa es un pedido: la columna nueva y el regex
 * viejo sobre `address`. Importa porque el regex vivía repetido en cinco
 * pantallas y ahora la red de seguridad es una sola — si esta se rompe, se
 * rompen las cinco a la vez.
 */
import { describe, it, expect } from 'vitest';
import { mesaDeFila, direccionDeMesa, etiquetaDeMesa } from './mesa';

describe('mesaDeFila', () => {
  it('la columna manda sobre el texto', () => {
    // Un pedido movido de mesa cuya dirección todavía no se reescribió: si
    // ganara el texto, el salón lo pondría en la mesa de la que salió.
    expect(mesaDeFila({ table_number: 8, address: 'Mesa 3' })).toBe(8);
  });

  it('sin columna, cae al texto (la 127 aún no ha corrido)', () => {
    expect(mesaDeFila({ address: 'Mesa 12' })).toBe(12);
    expect(mesaDeFila({ table_number: null, address: 'Mesa 12' })).toBe(12);
  });

  it('acepta el texto como lo escribe cada sitio', () => {
    expect(mesaDeFila({ address: 'mesa 4' })).toBe(4);
    expect(mesaDeFila({ address: 'MESA  7' })).toBe(7);
  });

  it('lo que no es una mesa devuelve null, no un 0', () => {
    // El 0 sería una mesa válida en un Record<number, …> y ensuciaría el
    // salón con una mesa fantasma.
    expect(mesaDeFila({ address: null })).toBeNull();
    expect(mesaDeFila({ address: '5a avenida 12-34, zona 1' })).toBeNull();
    expect(mesaDeFila({})).toBeNull();
    expect(mesaDeFila(null)).toBeNull();
  });

  it('una dirección con nombre NO se inventa un número', () => {
    // Es justo lo que la columna viene a permitir: hasta ahora un nombre
    // así habría dejado el pedido sin mesa en las cinco pantallas.
    expect(mesaDeFila({ address: 'Terraza 2' })).toBeNull();
    expect(mesaDeFila({ table_number: 21, address: 'Terraza 2' })).toBe(21);
  });

  it('un 0 en la columna es un número válido, no «vacío»', () => {
    expect(mesaDeFila({ table_number: 0, address: 'Mesa 9' })).toBe(0);
  });

  it('NaN en la columna no se cuela', () => {
    expect(mesaDeFila({ table_number: Number.NaN, address: 'Mesa 6' })).toBe(6);
  });
});

describe('etiquetaDeMesa', () => {
  it('con mesa, la nombra', () => {
    expect(etiquetaDeMesa({ table_number: 4, address: 'Mesa 4' })).toBe('Mesa 4');
  });

  it('sin mesa pero con dirección, enseña la dirección tal cual', () => {
    expect(etiquetaDeMesa({ address: 'Barra' })).toBe('Barra');
  });

  it('sin nada, el texto de reserva', () => {
    expect(etiquetaDeMesa({ address: null })).toBe('En local');
    expect(etiquetaDeMesa({ address: '   ' })).toBe('En local');
    expect(etiquetaDeMesa(null, 'Sin mesa')).toBe('Sin mesa');
  });
});

describe('direccionDeMesa', () => {
  it('escribe el texto que espera el regex de respaldo', () => {
    // Las dos mitades tienen que seguir cuadrando mientras la 127 no esté
    // en todas partes: lo que se escribe se tiene que poder volver a leer.
    for (const n of [1, 7, 12, 40]) {
      expect(mesaDeFila({ address: direccionDeMesa(n) })).toBe(n);
    }
  });
});
