import { describe, expect, it } from 'vitest';
import { ESTADO_INICIAL, minutosDePractica, pasoActual, platoSugerido } from './turno-practica';
import type { Product } from '@/types';

describe('pasoActual', () => {
  it('sigue el orden del turno real', () => {
    let e = { ...ESTADO_INICIAL };
    expect(pasoActual(e, true)).toBe(1);
    e = { ...e, abierta: true };
    expect(pasoActual(e, true)).toBe(2);
    e = { ...e, apuntado: true };
    expect(pasoActual(e, true)).toBe(2); // falta el extra
    e = { ...e, conExtra: true };
    expect(pasoActual(e, true)).toBe(3);
    e = { ...e, enviado: true };
    expect(pasoActual(e, true)).toBe(4);
    e = { ...e, listo: true };
    expect(pasoActual(e, true)).toBe(5);
    e = { ...e, corregido: true };
    expect(pasoActual(e, true)).toBe(6);
    e = { ...e, cobrado: true };
    expect(pasoActual(e, true)).toBe(7);
  });

  it('sin platos con extras basta con apuntar algo', () => {
    expect(pasoActual({ ...ESTADO_INICIAL, abierta: true, apuntado: true }, false)).toBe(3);
  });
});

describe('platoSugerido', () => {
  const p = (id: string, extra: boolean, disponible = true) =>
    ({ id, is_active: true, is_available: disponible, extra } as unknown as Product);
  const conExtra = (x: Product) => (x as unknown as { extra: boolean }).extra;

  it('propone el primero con algo que elegir y que esté disponible', () => {
    expect(platoSugerido([p('a', false), p('b', true, false), p('c', true)], conExtra)?.id).toBe('c');
  });

  it('sin ninguno, no propone nada', () => {
    expect(platoSugerido([p('a', false)], conExtra)).toBeNull();
  });
});

describe('minutosDePractica', () => {
  it('redondea y nunca dice cero', () => {
    expect(minutosDePractica(0, 20_000)).toBe(1);
    expect(minutosDePractica(0, 4 * 60_000 + 10_000)).toBe(4);
  });
});
