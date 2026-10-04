import 'server-only';

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantByIdCached } from '@/lib/db/restaurants';
import { getMenuDataCached, getTopSellingProductIdsCached } from '@/lib/db/menu';
import { formatPrice } from '@/lib/theme/resolve';
import { assetSrc } from '@/lib/asset-image';
import { suggestIcon } from '@/lib/category-icon';
import { ICON_PATHS } from '@/components/icons';
import { subdomainUrl } from '@/lib/tenant';
import {
  EMPTY_LANDING_SETTINGS,
  LANDING_SHOWCASE_KEY,
  LANDING_TESTIMONIALS_KEY,
  parseLandingSettings,
  pickShowcaseProducts,
  type LandingSettings,
} from '@/lib/landing-content';

/* ============================================================
   PORTADA DE LEOGIN — lo que se lee de la base (WEB-02/03)
   Ver lib/landing-content.ts. Se cachea 5 min con etiqueta: el Super
   la invalida al guardar, así que su cambio se ve al instante.
   ============================================================ */

export const LANDING_CONTENT_TAG = 'landing-content';

async function leerLandingSettings(): Promise<LandingSettings> {
  const { data, error } = await createServiceClient()
    .from('platform_settings')
    .select('key, value')
    .in('key', [LANDING_SHOWCASE_KEY, LANDING_TESTIMONIALS_KEY]);
  if (error || !data) return EMPTY_LANDING_SETTINGS;
  return parseLandingSettings(new Map(data.map((r: { key: string; value: string }) => [r.key, r.value])));
}

const readLandingSettingsCached = unstable_cache(leerLandingSettings, ['landing-content'], {
  revalidate: 300,
  tags: [LANDING_CONTENT_TAG],
});

export async function getLandingSettings(): Promise<LandingSettings> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return EMPTY_LANDING_SETTINGS;
  return readLandingSettingsCached();
}

/** Sin caché: el formulario del Super tiene que ver lo último guardado. */
export async function getLandingSettingsFresh(): Promise<LandingSettings> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return EMPTY_LANDING_SETTINGS;
  return leerLandingSettings();
}

export interface ShowcaseItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  /** Foto ya reducida (/img/128/…); null = icono de su categoría. */
  image: string | null;
  icon: string;
}

/** El menú de un restaurante real, listo para el teléfono de la portada. */
export interface Showcase {
  name: string;
  /** «Cocina de la casa · Zona 1» */
  line: string | null;
  logo: string | null;
  menuUrl: string;
  colors: { bg: string; text: string; accent: string; onAccent: string; scheme: 'dark' | 'light' };
  categories: string[];
  items: ShowcaseItem[];
  /** Lo que diría la barra del carrito con los dos primeros platillos. */
  cart: { count: number; total: string };
}

export interface TestimonialView {
  quote: string;
  person: string;
  role: string;
  restaurant: string;
  logo: string | null;
  accent: string;
  menuUrl: string;
}

async function buildShowcase(restaurantId: string): Promise<Showcase | null> {
  const r = await getRestaurantByIdCached(restaurantId);
  if (!r) return null;
  const [menu, top] = await Promise.all([
    getMenuDataCached(restaurantId),
    getTopSellingProductIdsCached(restaurantId),
  ]);

  // El mismo icono que pinta la carta para un platillo sin foto: el suyo,
  // el de su categoría o el que sugiere el nombre de la categoría.
  const valid = (icon: string | null | undefined) => (icon && ICON_PATHS[icon.trim()] ? icon.trim() : null);
  const catIcon = new Map(menu.categories.map((c) => [c.id, valid(c.icon) ?? suggestIcon(c.name)]));
  const picked = pickShowcaseProducts(menu.products, menu.categories.map((c) => c.id), top);
  // Con menos de dos platillos el teléfono quedaría vacío: mejor el ejemplo.
  if (picked.length < 2) return null;

  const cfg = r.resolved.config;
  const items: ShowcaseItem[] = picked.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: formatPrice(Number(p.price), cfg),
    image: p.image_url ? assetSrc(p.image_url, 128) : null,
    icon: valid(p.icon) ?? catIcon.get(p.category_id ?? '') ?? 'utensils',
  }));
  const enCarrito = picked.slice(0, 2);
  const total = enCarrito.reduce((s, p) => s + Number(p.price), 0);

  return {
    name: r.restaurant.name,
    line: [cfg.tagline, cfg.zone].filter(Boolean).join(' · ') || null,
    logo: cfg.logoUrl ? assetSrc(cfg.logoUrl, 96) : null,
    menuUrl: subdomainUrl(r.restaurant.slug),
    colors: {
      bg: cfg.colorBg,
      text: cfg.colorText,
      accent: cfg.colorAccent,
      onAccent: cfg.onAccent,
      scheme: cfg.scheme,
    },
    categories: menu.categories.slice(0, 4).map((c) => c.name),
    items,
    cart: { count: enCarrito.length, total: formatPrice(total, cfg) },
  };
}

async function buildTestimonials(list: LandingSettings['testimonials']): Promise<TestimonialView[]> {
  const rows = await Promise.all(
    list.map(async (t) => {
      // Un restaurante suspendido o borrado deja de salir solo.
      const r = await getRestaurantByIdCached(t.restaurantId);
      if (!r) return null;
      const cfg = r.resolved.config;
      return {
        quote: t.quote,
        person: t.person,
        role: t.role,
        restaurant: r.restaurant.name,
        logo: cfg.logoUrl ? assetSrc(cfg.logoUrl, 96) : null,
        accent: cfg.colorAccent,
        menuUrl: subdomainUrl(r.restaurant.slug),
      } satisfies TestimonialView;
    }),
  );
  return rows.filter((x): x is TestimonialView => x !== null);
}

/** Vitrina y testimonios para la portada. Si algo falla, la portada sale sin ellos. */
export async function getLandingProof(): Promise<{ showcase: Showcase | null; testimonials: TestimonialView[] }> {
  try {
    const s = await getLandingSettings();
    const [showcase, testimonials] = await Promise.all([
      s.showcaseId ? buildShowcase(s.showcaseId) : Promise.resolve(null),
      buildTestimonials(s.testimonials),
    ]);
    return { showcase, testimonials };
  } catch (e) {
    console.error('[landing] vitrina/testimonios:', e);
    return { showcase: null, testimonials: [] };
  }
}

export interface ShowcaseOption {
  id: string;
  name: string;
  slug: string;
  /** Platillos activos con foto: la vitrina se ve mejor con 4 o más. */
  withPhoto: number;
}

/** Restaurantes activos que el Super puede poner en la portada. */
export async function getShowcaseOptions(): Promise<ShowcaseOption[]> {
  const db = createServiceClient();
  const [{ data: rests }, { data: fotos }] = await Promise.all([
    db.from('restaurants').select('id, name, slug').eq('status', 'active').order('name'),
    db.from('products').select('restaurant_id').eq('is_active', true).not('image_url', 'is', null).limit(20000),
  ]);
  const conFoto = new Map<string, number>();
  for (const f of (fotos ?? []) as { restaurant_id: string }[]) {
    conFoto.set(f.restaurant_id, (conFoto.get(f.restaurant_id) ?? 0) + 1);
  }
  return ((rests ?? []) as { id: string; name: string; slug: string }[]).map((r) => ({
    ...r,
    withPhoto: conFoto.get(r.id) ?? 0,
  }));
}
