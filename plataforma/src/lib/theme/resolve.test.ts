import { describe, expect, it } from 'vitest';
import { computeTip, resolveTheme, tipAppliesToType } from './resolve';
import { DEFAULT_CONFIG } from './defaults';
import type { ThemeConfig } from './defaults';

/** Config base con propina obligatoria del 10% activa para DINE_IN. */
const TIP_CONFIG: ThemeConfig = {
  ...DEFAULT_CONFIG,
  tipEnabled: true,
  tipPercent: 10,
  tipOrderTypes: ['dine_in'],
};

describe('tipAppliesToType', () => {
  it('aplica cuando el tipo de pedido está en tipOrderTypes', () => {
    expect(tipAppliesToType(TIP_CONFIG, 'DINE_IN')).toBe(true);
  });

  it('no aplica a un tipo de pedido fuera de tipOrderTypes', () => {
    expect(tipAppliesToType(TIP_CONFIG, 'DELIVERY')).toBe(false);
  });

  it('no aplica si tipEnabled es false, aunque el tipo esté en la lista', () => {
    expect(tipAppliesToType({ ...TIP_CONFIG, tipEnabled: false }, 'DINE_IN')).toBe(false);
  });

  it('no aplica si tipPercent es 0 o negativo', () => {
    expect(tipAppliesToType({ ...TIP_CONFIG, tipPercent: 0 }, 'DINE_IN')).toBe(false);
    expect(tipAppliesToType({ ...TIP_CONFIG, tipPercent: -5 }, 'DINE_IN')).toBe(false);
  });
});

describe('computeTip', () => {
  it('devuelve 0 si el cliente no aceptó la propina', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', false, 100)).toBe(0);
  });

  it('devuelve 0 si el tipo de pedido no tiene propina obligatoria', () => {
    expect(computeTip(TIP_CONFIG, 'DELIVERY', true, 100)).toBe(0);
  });

  it('calcula el porcentaje exacto sobre el subtotal', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 100)).toBe(10);
    expect(computeTip({ ...TIP_CONFIG, tipPercent: 12.5 }, 'DINE_IN', true, 10)).toBe(1.25);
  });

  it('redondea al centavo más cercano en subtotales con decimales', () => {
    // 33.33 * 10% = 3.333 → redondea a 3.33 (dos decimales de moneda).
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 33.33)).toBe(3.33);
  });

  it('nunca calcula propina sobre subtotal 0', () => {
    expect(computeTip(TIP_CONFIG, 'DINE_IN', true, 0)).toBe(0);
  });
});

/* La forma del platillo se migró de `catalogView` ('grid'|'list') a `cardStyle`.
   Todo restaurante que ya opera tiene guardado el eje viejo, así que el
   resolver debe traducirlo: si se limitara al default, cada menú en vista
   lista amanecería en rejilla el día del despliegue. */
describe('resolveTheme · compatibilidad catalogView → cardStyle', () => {
  it('traduce la columna legacy catalog_view=list a filas', () => {
    expect(resolveTheme({ catalog_view: 'list' }).config.cardStyle).toBe('fila');
  });

  it('traduce un tema guardado con catalogView=list y sin cardStyle', () => {
    expect(resolveTheme({ config: { catalogView: 'list' } }).config.cardStyle).toBe('fila');
  });

  it('el eje nuevo le gana al viejo dentro de la misma capa', () => {
    const row = { config: { catalogView: 'list' as const, cardStyle: 'texto' as const } };
    expect(resolveTheme(row).config.cardStyle).toBe('texto');
  });

  it('una capa más específica con cardStyle gana sobre la columna legacy', () => {
    const row = { catalog_view: 'list', config: { cardStyle: 'mosaico' as const } };
    expect(resolveTheme(row).config.cardStyle).toBe('mosaico');
  });

  it('sin nada guardado usa el default (tarjeta)', () => {
    expect(resolveTheme(null).config.cardStyle).toBe('tarjeta');
    expect(resolveTheme({}).config.cardStyle).toBe('tarjeta');
  });
});

describe('textos por defecto viejos guardados en el tema (T-13: «tú»)', () => {
  it('el texto por defecto de antes se cambia por el de ahora', () => {
    const t = resolveTheme({ content: { checkout: { namePh: '¿Cómo te llamás?', errName: 'Decinos tu nombre' } } });
    expect(t.content.checkout.namePh).toBe('¿Cómo te llamas?');
    expect(t.content.checkout.errName).toBe('Dinos tu nombre');
  });

  it('lo que escribió el dueño se respeta tal cual', () => {
    const t = resolveTheme({ content: { checkout: { namePh: '¿Cómo te llamás, mae?' } } });
    expect(t.content.checkout.namePh).toBe('¿Cómo te llamás, mae?');
  });
});

describe('lema de relleno «Sabor que enamora» (CAT-03)', () => {
  it('ya no es el lema por defecto', () => {
    expect(resolveTheme(null, 'x').config.tagline).toBe('');
  });
  it('si quedó guardado en el tema, se trata como vacío', () => {
    const row = { config: { tagline: 'Sabor que enamora' } } as never;
    expect(resolveTheme(row, 'x').config.tagline).toBe('');
  });
  it('y si el restaurante tiene su lema propio, gana el suyo', () => {
    const row = { config: { tagline: 'Sabor que enamora' } } as never;
    expect(resolveTheme(row, 'x', { tagline: 'Café de especialidad' }).config.tagline).toBe('Café de especialidad');
  });
  it('un lema escrito por el dueño no se toca', () => {
    const row = { config: { tagline: 'El mejor pan de la zona 1' } } as never;
    expect(resolveTheme(row, 'x').config.tagline).toBe('El mejor pan de la zona 1');
  });
});
