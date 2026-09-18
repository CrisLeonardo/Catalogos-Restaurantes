import { describe, it, expect } from 'vitest';
import { partirDictado, emparejarDictado } from './voz';

const CARTA = [
  { id: 'pepian', name: 'Pepián de pollo', is_available: true },
  { id: 'limonada', name: 'Limonada con soda', is_available: true },
  { id: 'limonadaMenta', name: 'Limonada con soda y menta', is_available: true },
  { id: 'cerveza', name: 'Cerveza', is_available: true },
  { id: 'flan', name: 'Flan de leche', is_available: false },
];

describe('partirDictado', () => {
  it('parte por «y» y por comas', () => {
    expect(partirDictado('dos pepián y una limonada')).toEqual([
      { qty: 2, term: 'pepián', nota: '' },
      { qty: 1, term: 'limonada', nota: '' },
    ]);
  });

  it('lee los números en letra y en cifra', () => {
    expect(partirDictado('3 cervezas')[0].qty).toBe(3);
    expect(partirDictado('cuatro cervezas')[0].qty).toBe(4);
    expect(partirDictado('cervezas')[0].qty).toBe(1);
  });

  it('lo que va después de «sin» o «con» es nota para cocina', () => {
    expect(partirDictado('una limonada sin hielo')).toEqual([
      { qty: 1, term: 'limonada', nota: 'sin hielo' },
    ]);
  });

  it('una nota huérfana no inventa un plato', () => {
    expect(partirDictado('sin hielo')).toEqual([]);
  });

  it('una nota tras una pausa es del plato anterior', () => {
    /* «una limonada, sin hielo» es lo mismo que «una limonada sin hielo»:
       quien dicta hace esa pausa todo el rato. */
    expect(partirDictado('una limonada, sin hielo')).toEqual([
      { qty: 1, term: 'limonada', nota: 'sin hielo' },
    ]);
  });

  it('el dictado vacío no devuelve nada', () => {
    expect(partirDictado('  ')).toEqual([]);
  });
});

describe('emparejarDictado', () => {
  it('gana el nombre más corto que contiene lo dicho', () => {
    /* La gente dice «limonada», no «limonada con soda y menta». */
    const [l] = emparejarDictado(partirDictado('dos limonada'), CARTA);
    expect(l.producto.id).toBe('limonada');
    expect(l.qty).toBe(2);
  });

  it('un plato agotado NO entra por voz', () => {
    /* Entraría en la comanda sin que nadie lo hubiera visto en pantalla, y
       ese es justo el caso en que el mesero tiene que enterarse. */
    expect(emparejarDictado(partirDictado('un flan'), CARTA)).toEqual([]);
  });

  it('lo que no está en la carta se descarta en silencio', () => {
    expect(emparejarDictado(partirDictado('dos sushi'), CARTA)).toEqual([]);
  });

  it('la frase completa acaba siendo la comanda', () => {
    const out = emparejarDictado(
      partirDictado('dos pepián y una limonada sin hielo'),
      CARTA,
    );
    expect(out.map((l) => [l.producto.id, l.qty, l.nota])).toEqual([
      ['pepian', 2, ''],
      ['limonada', 1, 'sin hielo'],
    ]);
  });
});
