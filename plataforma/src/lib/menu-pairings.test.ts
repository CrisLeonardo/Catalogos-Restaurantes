/** «Acompáñalo con…» (auditoría 2026-10-02, CAT-13). */
import { describe, it, expect } from 'vitest';
import { tipoDeCategoria, sugerirAcompanantes, esDestacado, deUnToque, masPedidos, type ProductoSugerible } from './menu-pairings';

const CATS = [
  { id: 'bagels', name: 'Bagels' },
  { id: 'cafe', name: 'Café' },
  { id: 'frios', name: 'Fríos' },
  { id: 'dulce', name: 'Dulce' },
  { id: 'extras', name: 'Extras' },
];

const p = (id: string, category_id: string, extra: Partial<ProductoSugerible> = {}): ProductoSugerible => ({
  id, category_id, tags: [], options: null, is_available: true, unavailable_at: null, ...extra,
});

const CARTA = [
  p('negra-brava', 'bagels'),
  p('lox', 'bagels'),
  p('mocha', 'cafe', { options: [{ choices: ['chico', 'grande'] }] }),
  p('americano', 'cafe'),
  p('cold-brew', 'frios', { tags: ['Favorito'] }),
  p('brownie', 'dulce'),
  p('roll', 'dulce'),
  p('papas', 'extras'),
];

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('tipo de cada categoría por su nombre', () => {
  it('reconoce bebidas, postres y acompañamientos', () => {
    expect(tipoDeCategoria('Café')).toBe('bebida');
    expect(tipoDeCategoria('Bebidas frías')).toBe('bebida');
    expect(tipoDeCategoria('Fríos')).toBe('bebida');
    expect(tipoDeCategoria('Postres')).toBe('postre');
    expect(tipoDeCategoria('Café y postres')).toBe('postre');
    expect(tipoDeCategoria('Extras')).toBe('guarnicion');
    expect(tipoDeCategoria('Acompañamientos')).toBe('guarnicion');
  });

  it('lo demás es plato principal, y no confunde trozos de palabra', () => {
    expect(tipoDeCategoria('Bagels')).toBeNull();
    expect(tipoDeCategoria('Platos fuertes')).toBeNull(); // «te» de té no casa con «fuertes»
    expect(tipoDeCategoria('Tacos')).toBeNull();
  });
});

describe('qué se sugiere', () => {
  it('a un plato principal: una bebida, un acompañamiento y un postre', () => {
    const s = sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['negra-brava'] });
    expect(ids(s)).toEqual(['cold-brew', 'papas', 'brownie']);
  });

  it('la bebida favorita va primero; lo que pide elegir opciones no se ofrece', () => {
    const s = sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['lox'], max: 6 });
    expect(ids(s)).toContain('americano');
    expect(ids(s)).not.toContain('mocha');
    expect(s[0].id).toBe('cold-brew');
  });

  it('a un postre no le ofrece otro postre', () => {
    const s = sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['brownie'] });
    expect(ids(s)).toEqual(['cold-brew', 'papas', 'americano']);
  });

  it('en el carrito, solo lo que todavía no lleva (y con hueco, un segundo del mismo tipo)', () => {
    const s = sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['lox', 'americano'] });
    expect(ids(s)).toEqual(['papas', 'brownie', 'roll']);
  });

  it('con todo cubierto, nada que sugerir', () => {
    expect(sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['lox', 'americano', 'papas', 'roll'] })).toEqual([]);
  });

  it('sin nada en la base, nada', () => {
    expect(sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: [] })).toEqual([]);
    expect(sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['ya-no-existe'] })).toEqual([]);
  });

  it('no ofrece lo agotado ni lo de un menú fuera de horario', () => {
    const carta = CARTA.map((x) => (x.id === 'cold-brew' ? { ...x, is_available: false } : x));
    const s = sugerirAcompanantes({
      productos: carta, categorias: CATS, base: ['lox'],
      categoriaAbierta: (id) => id !== 'extras',
    });
    expect(ids(s)).toEqual(['americano', 'brownie', 'roll']);
  });

  it('respeta el tope', () => {
    expect(sugerirAcompanantes({ productos: CARTA, categorias: CATS, base: ['lox'], max: 1 })).toHaveLength(1);
  });
});

describe('piezas', () => {
  it('favorito con cualquier escritura', () => {
    expect(esDestacado(['Favorito'])).toBe(true);
    expect(esDestacado([' DESTACADO '])).toBe(true);
    expect(esDestacado(['Picante'])).toBe(false);
    expect(esDestacado(null)).toBe(false);
  });

  it('de un toque = sin grupos de opciones con algo que elegir', () => {
    expect(deUnToque({ options: null })).toBe(true);
    expect(deUnToque({ options: [{ choices: [] }] })).toBe(true);
    expect(deUnToque({ options: [{ choices: ['a'] }] })).toBe(false);
  });
});

describe('lo más pedido (checkout con el carrito vacío)', () => {
  it('lo vendido primero, luego favoritos, luego la carta; sin lo que pide opciones', () => {
    const s = masPedidos({ productos: CARTA, topIds: ['brownie', 'mocha', 'lox'], max: 4 });
    expect(ids(s)).toEqual(['brownie', 'lox', 'cold-brew', 'negra-brava']);
  });

  it('sin ventas todavía: favoritos y el orden de la carta', () => {
    expect(ids(masPedidos({ productos: CARTA, topIds: [], max: 2 }))).toEqual(['cold-brew', 'negra-brava']);
  });

  it('deja fuera lo agotado', () => {
    const carta = CARTA.map((x) => (x.id === 'brownie' ? { ...x, is_available: false } : x));
    expect(ids(masPedidos({ productos: carta, topIds: ['brownie'], max: 1 }))).toEqual(['cold-brew']);
  });
});
