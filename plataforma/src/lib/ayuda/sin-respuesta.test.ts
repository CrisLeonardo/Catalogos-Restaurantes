import { describe, expect, it } from 'vitest';
import { agruparBusquedas } from './sin-respuesta';

describe('búsquedas sin respuesta', () => {
  it('junta la misma frase sin acentos ni mayúsculas y pone lo más pedido primero', () => {
    const r = agruparBusquedas([
      { frase: 'exportar a contpaq', fecha: '2026-11-16T10:00:00Z', restaurante: 'Rincón 502' },
      { frase: 'cómo pongo propina', fecha: '2026-11-16T12:00:00Z', restaurante: null },
      { frase: 'Exportar a  Contpaq', fecha: '2026-11-16T11:00:00Z', restaurante: 'La Fonda' },
      { frase: 'exportar a contpaq', fecha: '2026-11-15T11:00:00Z', restaurante: 'Rincón 502' },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ veces: 3, frase: 'Exportar a  Contpaq', ultima: '2026-11-16T11:00:00Z', restaurantes: ['Rincón 502', 'La Fonda'] });
    expect(r[1]).toMatchObject({ veces: 1, restaurantes: [] });
  });
});
