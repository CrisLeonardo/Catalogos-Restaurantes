import { describe, expect, it } from 'vitest';
import { claveEnlace, resolverPlatillo, slugPlatillo, valorPlatillo } from './enlace-platillo';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

describe('enlace legible de un platillo', () => {
  it('saca el nombre sin acentos ni signos', () => {
    expect(slugPlatillo('Doble Bacon')).toBe('doble-bacon');
    expect(slugPlatillo('Lasaña de la Casa')).toBe('lasana-de-la-casa');
    expect(slugPlatillo('  Café (grande) ½  ')).toBe('cafe-grande');
  });

  it('acepta código o nombre en ?platillo= y descarta lo demás', () => {
    expect(valorPlatillo(ID_A.toUpperCase())).toBe(ID_A);
    expect(valorPlatillo('doble-bacon')).toBe('doble-bacon');
    expect(valorPlatillo('<script>')).toBeNull();
    expect(valorPlatillo(['doble-bacon'])).toBeNull();
  });

  it('comparte por nombre y abre el mismo platillo', () => {
    const carta = [{ id: ID_A, name: 'Doble Bacon' }, { id: ID_B, name: 'Rincón Clásica' }];
    const clave = claveEnlace(carta[0], carta);
    expect(clave).toBe('doble-bacon');
    expect(resolverPlatillo(clave, carta)?.id).toBe(ID_A);
    // Los enlaces con código que ya se compartieron siguen sirviendo.
    expect(resolverPlatillo(ID_B, carta)?.id).toBe(ID_B);
  });

  it('con un nombre repetido usa el código y nunca abre el equivocado', () => {
    const carta = [{ id: ID_A, name: 'Limonada' }, { id: ID_C, name: 'Limonada' }];
    expect(claveEnlace(carta[1], carta)).toBe(ID_C);
    expect(resolverPlatillo('limonada', carta)).toBeNull();
  });
});
