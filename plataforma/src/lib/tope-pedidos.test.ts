import { describe, it, expect } from 'vitest';
import { AVISO_TOPE, estadoDelTope, primerDiaDelMes } from './tope-pedidos';
import { PLANS } from './plans';

describe('estadoDelTope', () => {
  it('En línea tiene 300 pedidos al mes; los demás planes, ninguno', () => {
    expect(PLANS.EN_LINEA.monthlyOrderCap).toBe(300);
    expect(estadoDelTope('ESTANDAR', 5000)).toBeNull();
    expect(estadoDelTope('PREMIUM', 5000)).toBeNull();
    expect(estadoDelTope('BASICO', 5000)).toBeNull();
    expect(estadoDelTope(null, 10)).toBeNull();
  });

  it('avisa desde el 80 %', () => {
    const umbral = Math.ceil(300 * AVISO_TOPE);
    expect(estadoDelTope('EN_LINEA', umbral - 1)?.nivel).toBe('ok');
    expect(estadoDelTope('EN_LINEA', umbral)?.nivel).toBe('cerca');
  });

  it('llegar justo al tope todavía no es pasarlo', () => {
    expect(estadoDelTope('EN_LINEA', 300)).toMatchObject({ nivel: 'cerca', restantes: 0, fraccion: 1 });
    expect(estadoDelTope('EN_LINEA', 301)).toMatchObject({ nivel: 'pasado', restantes: 0, fraccion: 1 });
  });

  it('cuenta lo que queda', () => {
    expect(estadoDelTope('EN_LINEA', 120)).toMatchObject({ usados: 120, restantes: 180, fraccion: 0.4 });
  });
});

describe('primerDiaDelMes', () => {
  it('se queda con año y mes', () => {
    expect(primerDiaDelMes('2026-11-28')).toBe('2026-11-01');
  });
});
