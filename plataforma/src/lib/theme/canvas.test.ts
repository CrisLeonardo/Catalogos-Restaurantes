import { describe, expect, it } from 'vitest';
import {
  TIER_MIN_VW,
  canvasComposition,
  mosaicColumns,
  mosaicLayoutColumns,
  screenTier,
  textColumns,
  type ScreenTier,
} from './canvas';
import type { LayoutWidth } from './defaults';

const ALL_WIDTHS: LayoutWidth[] = ['movil', 'ancho', 'revista'];
const ALL_TIERS: ScreenTier[] = ['phone', 'tablet', 'desktop', 'wide'];
const RANK: Record<LayoutWidth, number> = { movil: 0, ancho: 1, revista: 2 };

describe('screenTier', () => {
  it('reparte los anchos de ventana usuales', () => {
    expect(screenTier(390)).toBe('phone');   // iPhone en vertical
    expect(screenTier(619)).toBe('phone');
    expect(screenTier(620)).toBe('tablet');
    expect(screenTier(844)).toBe('tablet');  // iPhone en horizontal
    expect(screenTier(768)).toBe('tablet');  // iPad en vertical
    expect(screenTier(999)).toBe('tablet');
    expect(screenTier(1000)).toBe('desktop');
    expect(screenTier(1280)).toBe('desktop');
    expect(screenTier(1399)).toBe('desktop');
    expect(screenTier(1400)).toBe('wide');
    expect(screenTier(2560)).toBe('wide');
  });

  it('es monótono: más ventana nunca baja de escalón', () => {
    let last = -1;
    for (let vw = 0; vw <= 2000; vw += 10) {
      const i = ALL_TIERS.indexOf(screenTier(vw));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it('cada escalón empieza justo en su corte', () => {
    for (const tier of ALL_TIERS) {
      if (TIER_MIN_VW[tier] === 0) continue;
      expect(screenTier(TIER_MIN_VW[tier])).toBe(tier);
      expect(screenTier(TIER_MIN_VW[tier] - 1)).not.toBe(tier);
    }
  });
});

describe('canvasComposition', () => {
  it('el ajuste del dueño es un TECHO: la pantalla nunca lo sube', () => {
    // Se probó lo contrario (que «Columna de móvil» se ensanchara en una
    // computadora) y se descartó: las piezas están dibujadas para 460 px.
    for (const tier of ALL_TIERS) {
      for (const w of ALL_WIDTHS) {
        expect(RANK[canvasComposition(w, tier)]).toBeLessThanOrEqual(RANK[w]);
      }
    }
    expect(canvasComposition('movil', 'wide')).toBe('movil');
    expect(canvasComposition('movil', 'desktop')).toBe('movil');
  });

  it('la pantalla sí lo REDUCE: en un teléfono todo se compone como móvil', () => {
    // Un lienzo de «revista» tiene 343 px reales en un teléfono; componerlo
    // como revista daba un mosaico de tres columnas de 106 px.
    for (const w of ALL_WIDTHS) expect(canvasComposition(w, 'phone')).toBe('movil');
    expect(canvasComposition('revista', 'tablet')).toBe('ancho');
    expect(canvasComposition('revista', 'desktop')).toBe('revista');
  });

  it('respeta el orden que eligió el dueño: nadie adelanta a nadie', () => {
    for (const tier of ALL_TIERS) {
      const [m, a, r] = ALL_WIDTHS.map((w) => RANK[canvasComposition(w, tier)]);
      expect(m).toBeLessThanOrEqual(a);
      expect(a).toBeLessThanOrEqual(r);
    }
  });
});

describe('mosaicColumns', () => {
  it('en la columna de móvil manda la elección del dueño', () => {
    expect(mosaicColumns('movil', 2, 9)).toBe(2);
    expect(mosaicColumns('movil', 3, 9)).toBe(3);
  });

  it('el lienzo ancho reparte en 2 y la página de revista en 3', () => {
    expect(mosaicColumns('ancho', 2, 9)).toBe(2);
    expect(mosaicColumns('revista', 2, 9)).toBe(3);
  });

  it('nunca más columnas que piezas (o quedaría una columna en blanco)', () => {
    expect(mosaicColumns('revista', 2, 2)).toBe(2);
  });

  it('nunca baja de 2: un mosaico de una columna no es un mosaico', () => {
    expect(mosaicColumns('revista', 2, 1)).toBe(2);
    expect(mosaicColumns('revista', 2, 0)).toBe(2);
    expect(mosaicColumns('movil', 1, 9)).toBe(2);
  });
});

describe('mosaicLayoutColumns', () => {
  it('no recorta por número de piezas: dice lo que cabe, no lo que hay', () => {
    // Es la diferencia entre «esta sección tiene 2 platillos» y «aquí caben 3
    // columnas»: sin ella, dos piezas se estiraban a llenar el lienzo.
    expect(mosaicLayoutColumns('revista', 2)).toBe(3);
    expect(mosaicColumns('revista', 2, 2)).toBe(2);
  });

  it('nunca es menor que lo que devuelve mosaicColumns', () => {
    for (const w of ALL_WIDTHS) {
      for (const items of [1, 2, 3, 5, 20]) {
        expect(mosaicColumns(w, 2, items)).toBeLessThanOrEqual(
          Math.max(2, mosaicLayoutColumns(w, 2)),
        );
      }
    }
  });
});

describe('textColumns', () => {
  it('la carta impresa solo se parte en la página de revista', () => {
    expect(textColumns('movil')).toBe(1);
    expect(textColumns('ancho')).toBe(1);
    expect(textColumns('revista')).toBe(2);
  });
});
