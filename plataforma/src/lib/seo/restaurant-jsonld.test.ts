import { describe, expect, it } from 'vitest';
import { currencyCodeFor, jsonLdScript, restaurantJsonLd } from './restaurant-jsonld';

type LD = {
  '@type': string;
  priceRange?: string;
  openingHoursSpecification?: unknown[];
  hasMenu: { hasMenuSection: { name: string; hasMenuItem: { offers: unknown }[] }[] };
};
const ld = (input: Parameters<typeof restaurantJsonLd>[0]) => restaurantJsonLd(input) as unknown as LD;

const base = {
  name: 'Rincón 502',
  hours: { '1': [['08:00', '21:00']], '6': [['09:00', '01:00']] } as const,
  currency: 'GTQ',
  categories: [{ id: 'c1', name: 'Bagels' }, { id: 'c2', name: 'Vacía' }],
  products: [
    { name: 'Negra Brava', price: 45, category_id: 'c1', description: 'Bagel de carbón' },
    { name: 'Roll de Canela', price: 25, category_id: 'c1' },
    { name: 'Suelto', price: 10, category_id: null },
  ],
};

describe('restaurantJsonLd', () => {
  it('describe el restaurante, el rango de precios y la carta por secciones', () => {
    const out = ld({ ...base, hours: { ...base.hours } as never });
    expect(out['@type']).toBe('Restaurant');
    expect(out.priceRange).toBe('Q10–Q45');
    const sections = out.hasMenu.hasMenuSection;
    // La categoría sin platillos no sale; los sueltos van a «Otros».
    expect(sections.map((s) => s.name)).toEqual(['Bagels', 'Otros']);
    expect(sections[0].hasMenuItem[0].offers).toEqual({ '@type': 'Offer', price: '45.00', priceCurrency: 'GTQ' });
  });

  it('traduce el horario semanal a OpeningHoursSpecification', () => {
    const out = ld({ ...base, hours: { ...base.hours } as never });
    expect(out.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '08:00', closes: '21:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Saturday', opens: '09:00', closes: '01:00' },
    ]);
  });

  it('sin horario configurado no afirma ninguno', () => {
    const out = ld({ ...base, hours: null });
    expect(out.openingHoursSpecification).toBeUndefined();
  });
});

describe('jsonLdScript', () => {
  it('no deja que un nombre cierre la etiqueta <script>', () => {
    const out = jsonLdScript({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
});

describe('currencyCodeFor', () => {
  it('reconoce los símbolos de la región', () => {
    expect(currencyCodeFor('Q')).toBe('GTQ');
    expect(currencyCodeFor('$', 'es-MX')).toBe('MXN');
    expect(currencyCodeFor('$', 'es-SV')).toBe('USD');
    expect(currencyCodeFor(undefined)).toBe('GTQ');
  });
});
