/** Qué cambió de precio al guardar un platillo (PROD-10). */
import { describe, expect, it } from 'vitest';
import { cambiosDePrecio, hayCambioDePrecio, mismoJson } from './activity-diff';
import type { ProductOptionGroup } from '@/types';

const tamano = (grande: number): ProductOptionGroup[] => [{
  id: 'g1', name: 'Tamaño', type: 'single', required: true,
  choices: [{ id: 'c1', name: 'Normal', priceDelta: 0 }, { id: 'c2', name: 'Grande', priceDelta: grande }],
}];

describe('cambiosDePrecio', () => {
  it('solo el precio base', () => {
    const c = cambiosDePrecio({ price: '50.00', options: null }, { price: 40, options: null });
    expect(c).toEqual({ precio: { antes: 50, despues: 40 }, opciones: [] });
    expect(hayCambioDePrecio(c)).toBe(true);
  });

  it('guardar sin tocar importes no anota nada (aunque llegue como texto)', () => {
    const c = cambiosDePrecio({ price: '50.00', options: tamano(5) }, { price: 50, options: tamano(5) });
    expect(hayCambioDePrecio(c)).toBe(false);
  });

  it('el importe de una opción, por id', () => {
    const c = cambiosDePrecio({ price: 50, options: tamano(5) }, { price: 50, options: tamano(2.5) });
    expect(c.precio).toBeNull();
    expect(c.opciones).toEqual([{ que: 'Tamaño › Grande', antes: 5, despues: 2.5 }]);
  });

  it('una opción nueva o quitada no es un cambio de precio', () => {
    const nuevo = tamano(5);
    nuevo[0].choices.push({ id: 'c3', name: 'Familiar', priceDelta: 20 });
    expect(hayCambioDePrecio(cambiosDePrecio({ price: 50, options: tamano(5) }, { price: 50, options: nuevo }))).toBe(false);
    expect(hayCambioDePrecio(cambiosDePrecio({ price: 50, options: tamano(5) }, { price: 50, options: null }))).toBe(false);
  });

  it('las variantes de un componente de combo', () => {
    const combo = (coca: number): ProductOptionGroup[] => [{
      id: 'g', name: 'Combo', type: 'combo',
      choices: [{ id: 'b', name: 'Bebida', priceDelta: 0, variants: [{ id: 'v', name: 'Coca-Cola', priceDelta: coca }] }],
    }];
    expect(cambiosDePrecio({ price: 60, options: combo(0) }, { price: 60, options: combo(3) }).opciones)
      .toEqual([{ que: 'Combo › Bebida › Coca-Cola', antes: 0, despues: 3 }]);
  });
});

describe('mismoJson (horario: jsonb reordena las claves)', () => {
  it('mismo contenido con otro orden de claves es igual', () => {
    expect(mismoJson({ mon: [{ open: '08:00', close: '17:00' }], tue: [] }, { tue: [], mon: [{ close: '17:00', open: '08:00' }] })).toBe(true);
    expect(mismoJson([null, undefined, 'America/Guatemala'], [null, null, 'America/Guatemala'])).toBe(true);
  });

  it('un cambio de hora o de orden de los turnos sí cuenta', () => {
    expect(mismoJson({ mon: [{ open: '08:00' }] }, { mon: [{ open: '09:00' }] })).toBe(false);
    expect(mismoJson({ mon: [1, 2] }, { mon: [2, 1] })).toBe(false);
  });
});
