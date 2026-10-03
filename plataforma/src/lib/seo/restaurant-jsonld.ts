/* ============================================================
   DATOS ESTRUCTURADOS DEL MENÚ (schema.org) — auditoría 2026-10-02, CAT-11
   ------------------------------------------------------------
   Google arma la ficha de un local (horario, precios, carta) con
   estos datos. El menú no publicaba ninguno. Esto describe el
   restaurante (`Restaurant`), su horario y su carta (`Menu` →
   `MenuSection` → `MenuItem` con precio) a partir de lo que la
   página ya cargó: cero consultas nuevas.

   Pura: sin dependencias de servidor, con pruebas al lado.
   ============================================================ */

import type { WeeklyHours, DayKey } from '@/lib/hours';

const SCHEMA_DAY: Record<DayKey, string> = {
  '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday',
  '4': 'Thursday', '5': 'Friday', '6': 'Saturday',
};

/** Código ISO de la moneda a partir del símbolo que configuró el restaurante. */
export function currencyCodeFor(symbol: string | null | undefined, locale?: string | null): string {
  const s = (symbol ?? '').trim();
  if (s === 'Q') return 'GTQ';
  if (s === '€') return 'EUR';
  if (s === 'L') return 'HNL';
  if (s === 'C$') return 'NIO';
  if (s === '₡') return 'CRC';
  if (s === '$') return (locale ?? '').toUpperCase().includes('MX') ? 'MXN' : 'USD';
  return 'GTQ';
}

interface Input {
  name: string;
  description?: string | null;
  url?: string | null;
  logo?: string | null;
  address?: string | null;
  telephone?: string | null;
  hours: WeeklyHours | null;
  currency: string;
  categories: { id: string; name: string }[];
  products: {
    name: string;
    description?: string | null;
    price: number;
    category_id?: string | null;
    image_url?: string | null;
  }[];
}

/** Máximo de platillos que se describen (el plan Básico admite 150). */
const MAX_ITEMS = 250;

export function restaurantJsonLd(input: Input): Record<string, unknown> {
  const products = input.products.filter((p) => Number.isFinite(p.price) && p.price >= 0).slice(0, MAX_ITEMS);
  const prices = products.map((p) => p.price).filter((n) => n > 0);
  const sym = input.currency === 'GTQ' ? 'Q' : `${input.currency} `;
  const priceRange = prices.length
    ? Math.min(...prices) === Math.max(...prices)
      ? `${sym}${Math.round(Math.min(...prices))}`
      : `${sym}${Math.round(Math.min(...prices))}–${sym}${Math.round(Math.max(...prices))}`
    : undefined;

  const item = (p: Input['products'][number]) => ({
    '@type': 'MenuItem',
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.image_url && /^https?:\/\//.test(p.image_url) ? { image: p.image_url } : {}),
    offers: { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: input.currency },
  });

  const known = new Set(input.categories.map((c) => c.id));
  const sections = input.categories
    .map((c) => ({
      '@type': 'MenuSection',
      name: c.name,
      hasMenuItem: products.filter((p) => p.category_id === c.id).map(item),
    }))
    .filter((s) => s.hasMenuItem.length > 0);
  const loose = products.filter((p) => !p.category_id || !known.has(p.category_id));
  if (loose.length) sections.push({ '@type': 'MenuSection', name: 'Otros', hasMenuItem: loose.map(item) });

  // Sin horario configurado no se afirma nada (no es lo mismo que «24 h»).
  const hours = input.hours
    ? (Object.keys(SCHEMA_DAY) as DayKey[]).flatMap((d) =>
        (input.hours?.[d] ?? []).map(([opens, closes]) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${SCHEMA_DAY[d]}`,
          opens,
          closes,
        })),
      )
    : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.logo && /^https?:\/\//.test(input.logo) ? { image: input.logo, logo: input.logo } : {}),
    ...(input.address ? { address: { '@type': 'PostalAddress', streetAddress: input.address } } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(sections.length
      ? { hasMenu: { '@type': 'Menu', name: `Menú de ${input.name}`, hasMenuSection: sections } }
      : {}),
  };
}

/** JSON listo para un <script type="application/ld+json">: sin `<` crudos,
 *  así un nombre de platillo como «</script>…» no puede cerrar la etiqueta. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
