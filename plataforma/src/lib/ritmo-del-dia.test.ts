import { describe, expect, it } from 'vitest';
import { ritmoDelDia } from './ritmo-del-dia';

const pace = (samples: number, typicalSoFar: number, typicalFullDay: number) =>
  ({ samples, typicalSoFar, typicalFullDay });

describe('ritmoDelDia', () => {
  it('antes de la primera venta no compara: da la meta del día', () => {
    expect(ritmoDelDia(0, pace(4, 22.45, 1240))).toEqual({ tipo: 'esperando', cierreTipico: 1240 });
  });

  it('con ventas compara contra lo de un día igual a esta hora', () => {
    expect(ritmoDelDia(150, pace(4, 100, 1240))).toEqual({ tipo: 'comparado', delta: 50, tipicoAEstaHora: 100 });
    expect(ritmoDelDia(60, pace(4, 100, 1240))).toEqual({ tipo: 'comparado', delta: -40, tipicoAEstaHora: 100 });
  });

  it('nunca dice −100 %', () => {
    expect(ritmoDelDia(0, pace(4, 500, 1240))?.tipo).toBe('esperando');
  });

  it('con menos de dos días iguales no dice nada', () => {
    expect(ritmoDelDia(0, pace(1, 22, 1240))).toBeNull();
    expect(ritmoDelDia(150, pace(1, 100, 1240))).toBeNull();
    expect(ritmoDelDia(150, null)).toBeNull();
  });

  it('sin referencia a esta hora (abre más tarde de lo normal) no inventa porcentaje', () => {
    expect(ritmoDelDia(80, pace(4, 0, 1240))).toBeNull();
  });

  it('sin historia de cierre tampoco hay meta que dar', () => {
    expect(ritmoDelDia(0, pace(4, 0, 0))).toBeNull();
  });
});
