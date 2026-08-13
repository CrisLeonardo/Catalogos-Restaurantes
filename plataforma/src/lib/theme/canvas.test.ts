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
    const order = ALL_TIERS;
    let last = -1;
    for (let vw = 0; vw <= 2000; vw += 10) {
      const i = order.indexOf(screenTier(vw));
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
  it('en el teléfono los tres ajustes se ven igual', () => {
    for (const w of ALL_WIDTHS) expect(canvasComposition(w, 'phone')).toBe('movil');
  });

  it('«Columna de móvil» deja de ser una columna fija en escritorio', () => {
    // Era el fallo de fondo: 460 px en un monitor de 1.440 con dos franjas
    // de fondo vacío a los lados.
    expect(canvasComposition('movil', 'tablet')).toBe('movil');
    expect(canvasComposition('movil', 'desktop')).toBe('ancho');
    expect(canvasComposition('movil', 'wide')).toBe('ancho');
  });

  it('respeta el orden que eligió el dueño: nadie adelanta a nadie', () => {
    const rank = { movil: 0, ancho: 1, revista: 2 };
    for (const tier of ALL_TIERS) {
      const [m, a, r] = ALL_WIDTHS.map((w) => rank[canvasComposition(w, tier)]);
      expect(m).toBeLessThanOrEqual(a);
      expect(a).toBeLessThanOrEqual(r);
    }
  });

  it('nunca compone más ancho de lo que el dueño pidió, salvo el salto de «móvil»', () => {
    const rank = { movil: 0, ancho: 1, revista: 2 };
    for (const tier of ALL_TIERS) {
      for (const w of ['ancho', 'revista'] as LayoutWidth[]) {
        expect(rank[canvasComposition(w, tier)]).toBeLessThanOrEqual(rank[w]);
      }
    }
  });
});

describe('mosaicColumns', () => {
  it('en el teléfono manda la elección del dueño', () => {
    expect(mosaicColumns('movil', 'phone', 2, 9)).toBe(2);
    expect(mosaicColumns('movil', 'phone', 3, 9)).toBe(3);
  });

  it('crece con la pantalla en vez de dar piezas de medio metro', () => {
    expect(mosaicColumns('ancho', 'tablet', 2, 9)).toBe(2);
    expect(mosaicColumns('ancho', 'desktop', 2, 9)).toBe(3);
    expect(mosaicColumns('revista', 'desktop', 2, 9)).toBe(4);
    expect(mosaicColumns('revista', 'wide', 2, 9)).toBe(4);
  });

  it('nunca más columnas que piezas (o quedaría una columna en blanco)', () => {
    expect(mosaicColumns('revista', 'wide', 2, 3)).toBe(3);
    expect(mosaicColumns('revista', 'wide', 2, 2)).toBe(2);
  });

  it('nunca baja de 2: un mosaico de una columna no es un mosaico', () => {
    expect(mosaicColumns('revista', 'wide', 2, 1)).toBe(2);
    expect(mosaicColumns('revista', 'wide', 2, 0)).toBe(2);
    expect(mosaicColumns('movil', 'phone', 1, 9)).toBe(2);
  });
});

describe('mosaicLayoutColumns', () => {
  it('no recorta por número de piezas: dice lo que cabe, no lo que hay', () => {
    // Es la diferencia entre «esta sección tiene 2 platillos» y «aquí caben
    // 2 columnas»: sin ella, dos piezas se estiraban a 646 px cada una.
    expect(mosaicLayoutColumns('revista', 'wide', 2)).toBe(4);
    expect(mosaicColumns('revista', 'wide', 2, 2)).toBe(2);
  });

  it('nunca es menor que lo que devuelve mosaicColumns', () => {
    for (const tier of ALL_TIERS) {
      for (const w of ALL_WIDTHS) {
        for (const items of [1, 2, 3, 5, 20]) {
          expect(mosaicColumns(w, tier, 2, items)).toBeLessThanOrEqual(
            Math.max(2, mosaicLayoutColumns(w, tier, 2)),
          );
        }
      }
    }
  });
});

describe('textColumns', () => {
  it('la carta impresa se parte solo cuando la columna da para dos', () => {
    expect(textColumns('phone', 'movil')).toBe(1);
    expect(textColumns('tablet', 'ancho')).toBe(1);
    expect(textColumns('desktop', 'ancho')).toBe(2);
    expect(textColumns('wide', 'ancho')).toBe(2);
  });

  it('la doble página de revista en monitor grande admite tres', () => {
    expect(textColumns('wide', 'revista')).toBe(3);
    expect(textColumns('desktop', 'revista')).toBe(2);
  });
});
