import { describe, expect, it } from 'vitest';
import { buscarPlato, leerPuestos, prepararPuestos } from './turno';
import type { Product } from '@/types';

function plato(id: string, name: string, disponible = true, activo = true): Product {
  return { id, name, is_active: activo, is_available: disponible } as Product;
}

describe('puestos de Servicio', () => {
  const cafe = plato('cafe', 'Café de olla');
  const limo = plato('limo', 'Limonada', false);
  const pollo = plato('pollo', 'Pollo a la plancha');
  const carta = [cafe, limo, pollo, plato('retirado', 'Ya no está', false, false)];

  it('completa el primer turno con platos activos y conserva un puesto agotado', () => {
    expect(prepararPuestos(undefined, ['limo', 'retirado'], carta)).toEqual(['limo', 'cafe', 'pollo']);
  });

  it('conserva huecos y puestos aunque cambien las ventas o la carta', () => {
    const puestos = leerPuestos(['cafe', null, 'limo']);
    expect(prepararPuestos(puestos!, ['pollo'], [pollo, cafe])).toEqual(['cafe', null, 'limo']);
    expect(leerPuestos(['cafe', 'cafe'])).toBeNull();
  });

  it('reconoce tildes y alias sin convertir un agotado en una selección', () => {
    expect(buscarPlato(carta, 'cafe', {})).toBe(cafe);
    expect(buscarPlato(carta, 'especial', { pollo: 'Especial del día' })).toBe(pollo);
    expect(buscarPlato(carta, 'limonada', {})).toBeNull();
  });
});
