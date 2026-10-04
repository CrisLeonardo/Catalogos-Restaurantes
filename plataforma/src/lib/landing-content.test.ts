/** Vitrina y testimonios de la portada (auditoría 2026-10-02, WEB-02 y WEB-03). */
import { describe, it, expect } from 'vitest';
import {
  LANDING_SHOWCASE_KEY,
  LANDING_TESTIMONIALS_KEY,
  MAX_TESTIMONIALS,
  parseLandingSettings,
  pickShowcaseProducts,
  serializeLandingSettings,
} from './landing-content';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

const t = (restaurantId: string, extra: Record<string, unknown> = {}) => ({
  restaurantId, quote: 'Los pedidos ya no se pierden.', person: 'Ana', role: 'Dueña', ...extra,
});

describe('lo guardado en platform_settings', () => {
  it('sin nada guardado sale vacío', () => {
    expect(parseLandingSettings(new Map())).toEqual({ showcaseId: null, testimonials: [] });
  });

  it('ida y vuelta: lo que se guarda es lo que se lee', () => {
    const s = { showcaseId: R1, testimonials: [t(R1), t(R2, { role: '' })] };
    const map = new Map(serializeLandingSettings(s).map((r) => [r.key, r.value]));
    expect(parseLandingSettings(map)).toEqual(s);
  });

  it('JSON roto o con otra forma no tumba la portada', () => {
    const map = new Map([
      [LANDING_SHOWCASE_KEY, '{no es json'],
      [LANDING_TESTIMONIALS_KEY, '{"restaurantId":"x"}'],
    ]);
    expect(parseLandingSettings(map)).toEqual({ showcaseId: null, testimonials: [] });
  });

  it('una vitrina con id que no es uuid se ignora', () => {
    const map = new Map([[LANDING_SHOWCASE_KEY, JSON.stringify({ restaurantId: "'; drop table" })]]);
    expect(parseLandingSettings(map).showcaseId).toBeNull();
  });

  it('descarta solo el testimonio inválido y se queda con los buenos', () => {
    const map = new Map([[
      LANDING_TESTIMONIALS_KEY,
      JSON.stringify([t(R1), t(R2, { quote: '' }), { quote: 'sin restaurante' }, t(R2, { quote: 'x'.repeat(281) })]),
    ]]);
    expect(parseLandingSettings(map).testimonials.map((x) => x.restaurantId)).toEqual([R1]);
  });

  it(`nunca más de ${MAX_TESTIMONIALS}`, () => {
    const map = new Map([[LANDING_TESTIMONIALS_KEY, JSON.stringify([t(R1), t(R2), t(R1), t(R2), t(R1)])]]);
    expect(parseLandingSettings(map).testimonials).toHaveLength(MAX_TESTIMONIALS);
  });

  it('sin vitrina ni testimonios guarda texto vacío (la columna es NOT NULL)', () => {
    expect(serializeLandingSettings({ showcaseId: null, testimonials: [] })).toEqual([
      { key: LANDING_SHOWCASE_KEY, value: '' },
      { key: LANDING_TESTIMONIALS_KEY, value: '' },
    ]);
  });
});

describe('qué platillos salen en el teléfono', () => {
  const p = (id: string, category_id: string, extra: Record<string, unknown> = {}) => ({
    id, category_id, image_url: `https://x/${id}.webp`, is_available: true, unavailable_at: null, sort_order: 0, ...extra,
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const CATS = ['entradas', 'fuertes', 'bebidas'];

  it('sigue el orden de la carta: categoría y luego platillo', () => {
    const carta = [p('b1', 'bebidas'), p('f2', 'fuertes', { sort_order: 2 }), p('f1', 'fuertes', { sort_order: 1 }), p('e1', 'entradas')];
    expect(ids(pickShowcaseProducts(carta, CATS))).toEqual(['e1', 'f1', 'f2', 'b1']);
  });

  it('los más pedidos van primero', () => {
    const carta = [p('e1', 'entradas'), p('f1', 'fuertes'), p('b1', 'bebidas')];
    expect(ids(pickShowcaseProducts(carta, CATS, ['b1', 'f1']))).toEqual(['b1', 'f1', 'e1']);
  });

  it('con foto antes que sin foto, aunque el sin foto se venda más', () => {
    const carta = [p('e1', 'entradas', { image_url: null }), p('f1', 'fuertes')];
    expect(ids(pickShowcaseProducts(carta, CATS, ['e1']))).toEqual(['f1', 'e1']);
  });

  it('no enseña lo que hoy no se puede pedir', () => {
    const carta = [
      p('agotado', 'entradas', { is_available: false, unavailable_at: new Date().toISOString() }),
      p('sin-existencias', 'entradas', { track_stock: true, stock: 0 }),
      p('ok', 'fuertes'),
    ];
    expect(ids(pickShowcaseProducts(carta, CATS))).toEqual(['ok']);
  });

  it('corta en n', () => {
    const carta = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => p(id, 'fuertes'));
    expect(pickShowcaseProducts(carta, CATS, [], 4)).toHaveLength(4);
  });
});
