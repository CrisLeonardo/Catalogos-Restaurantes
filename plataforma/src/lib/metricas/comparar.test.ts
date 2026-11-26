import { describe, expect, it } from 'vitest';
import { compararVisitas, observaciones } from './comparar';

describe('METRICAS-01 · comparar con poco historial', () => {
  it('con un día típico de 0.29 no inventa un 600 %', () => {
    expect(compararVisitas(2, 0.29)).toEqual({ tipo: 'conteo', hoy: 2 });
  });
  it('sin visitas hoy y sin base no dice nada', () => {
    expect(compararVisitas(0, 1)).toBeNull();
  });
  it('con base suficiente compara contra el mismo número que enseña', () => {
    expect(compararVisitas(30, 20.4)).toEqual({ tipo: 'porcentaje', tipico: 20, delta: 50 });
  });
  it('una diferencia pequeña no se anuncia', () => {
    expect(compararVisitas(20, 20)).toBeNull();
  });
  it('cuenta observaciones en singular y plural', () => {
    expect(observaciones(1, 'pedido', 'pedidos')).toBe('1 pedido');
    expect(observaciones(2, 'pedido', 'pedidos')).toBe('2 pedidos');
  });
});
