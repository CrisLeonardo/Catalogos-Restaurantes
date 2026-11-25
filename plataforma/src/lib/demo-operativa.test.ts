import { describe, expect, it } from 'vitest';
import { billetesSugeridos, cambio, casoDemo, partesIguales, platosDeDemo } from './demo-operativa';

describe('demo por caso · mostrador y mesas', () => {
  it('solo acepta los dos casos operativos', () => {
    expect(casoDemo('mostrador')).toBe('mostrador');
    expect(casoDemo('mesas')).toBe('mesas');
    expect(casoDemo('carta')).toBeNull();
    expect(casoDemo(undefined)).toBeNull();
  });

  it('da el cambio en centavos exactos y rechaza un pago corto', () => {
    expect(cambio(70, 100)).toBe(30);
    expect(cambio(23.34, 50)).toBe(26.66);
    expect(cambio(70, 50)).toBeNull();
    expect(cambio(70, 70)).toBe(0);
  });

  it('sugiere el exacto y billetes que alcanzan, sin repetir', () => {
    expect(billetesSugeridos(70)).toEqual([70, 100, 200]);
    expect(billetesSugeridos(52)).toEqual([52, 55, 60, 100]);
    expect(billetesSugeridos(23.34)).toEqual([23.34, 25, 30, 50]);
  });

  it('reparte Q70 entre tres como en la auditoría: 23.34 + 23.33 + 23.33', () => {
    const partes = partesIguales(70, 3);
    expect(partes).toEqual([23.34, 23.33, 23.33]);
    expect(Math.round(partes.reduce((s, n) => s + n, 0) * 100)).toBe(7000);
  });

  it('elige primero los platillos de la maqueta y completa con otros disponibles', () => {
    const productos = [
      { id: 'a', name: 'Pizza', price: 80 },
      { id: 'b', name: 'Limonada con Menta', price: 18 },
      { id: 'c', name: 'Rincón Clásica', price: 52 },
      { id: 'd', name: 'Agotada', price: 10, is_available: false },
      { id: 'e', name: 'Sin precio', price: 0 },
    ];
    expect(platosDeDemo(productos, 3).map((p) => p.nombre)).toEqual(['Rincón Clásica', 'Limonada con Menta', 'Pizza']);
  });
});
