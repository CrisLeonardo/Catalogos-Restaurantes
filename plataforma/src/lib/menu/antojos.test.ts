import { describe, expect, it } from 'vitest';
import { antojosDisponibles, coincideAntojo, umbralBarato } from './antojos';

const carta = [
  { name: 'Nachos Supremos', price: 48 },
  { name: 'Rincón Clásica', price: 52 },
  { name: 'Ensalada Griega', price: 45, dietary_tags: ['vegetariano'] },
  { name: 'Alitas BBQ', price: 55, dietary_tags: ['picante'] },
  { name: 'Limonada', price: 18 },
];

describe('antojos', () => {
  it('el umbral barato es la mediana redondeada a 5', () => {
    expect(umbralBarato(carta)).toBe(45);
  });

  it('detecta para compartir por nombre o etiqueta', () => {
    expect(coincideAntojo(carta[0], 'compartir', null)).toBe(true);
    expect(coincideAntojo({ name: 'Tabla de quesos', price: 90 }, 'compartir', null)).toBe(true);
    expect(coincideAntojo(carta[1], 'compartir', null)).toBe(false);
  });

  it('solo ofrece los atajos que sirven', () => {
    const ids = antojosDisponibles(carta, 'Q').map((a) => a.id);
    expect(ids).toEqual(['compartir', 'barato', 'sin_carne', 'picante']);
    const sinPicante = antojosDisponibles(carta.filter((p) => !p.dietary_tags?.includes('picante')), 'Q').map((a) => a.id);
    expect(sinPicante).not.toContain('picante');
  });

  it('el atajo dice el precio', () => {
    expect(antojosDisponibles(carta, 'Q').find((a) => a.id === 'barato')?.label).toBe('Menos de Q45');
  });
});
