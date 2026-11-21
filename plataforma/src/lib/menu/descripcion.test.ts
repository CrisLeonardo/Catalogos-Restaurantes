import { describe, expect, it } from 'vitest';
import { descripcionVaga } from './descripcion';

describe('descripción que vende', () => {
  it('vacía o solo elogios es vaga', () => {
    expect(descripcionVaga('')).toBe(true);
    expect(descripcionVaga('¡Deliciosa!')).toBe(true);
    expect(descripcionVaga('La más rica de la casa')).toBe(true);
  });
  it('lo que lleva no es vago', () => {
    expect(descripcionVaga('Carne de 150 g, queso cheddar y tomate. Con papas.')).toBe(false);
    expect(descripcionVaga('Deliciosa lasaña con carne molida y bechamel')).toBe(false);
  });
});
