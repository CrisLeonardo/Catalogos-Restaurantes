import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ResolvedTheme } from '@/lib/theme/resolve';
import type { Restaurant, RestaurantTheme } from '@/types';

export type RestaurantWithTheme = {
  restaurant: Restaurant;
  theme: RestaurantTheme;
  /** Tema ya resuelto (defaults ← legacy ← config ← override por código). */
  resolved: ResolvedTheme;
};

/**
 * Resuelve un slug de subdominio a su restaurante + tema.
 * Cached por request: se llama desde layout y page sin doble query a Supabase.
 * Devuelve null si Supabase no está configurado o el restaurante no existe.
 */
export const getRestaurantBySlug = cache(
  async (slug: string): Promise<RestaurantWithTheme | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabase = await createClient();

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (error || !restaurant) return null;

    const { data: theme } = await supabase
      .from('restaurant_themes')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .single();

    const themeRow = (theme as RestaurantTheme) ?? defaultTheme(restaurant.id as string);

    return {
      restaurant: restaurant as Restaurant,
      theme: themeRow,
      resolved: resolveTheme(themeRow, slug, {
        brandName: restaurant.name as string,
        tagline: restaurant.tagline as string | null,
      }),
    };
  }
);

/**
 * Resuelve un restaurant id → { slug, status }, sin traer el theme.
 * Usado por el redirector estable de mesas/QR (src/app/m/[restaurantId]/…):
 * el link impreso en la mesa nunca cambia, pero el slug al que apunta sí
 * puede cambiar con el tiempo — esta consulta siempre trae el slug VIGENTE.
 * Cached por request igual que getRestaurantBySlug.
 */
export const getRestaurantSlugById = cache(
  async (restaurantId: string): Promise<{ slug: string; status: Restaurant['status'] } | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('restaurants')
      .select('slug, status')
      .eq('id', restaurantId)
      .single();

    if (error || !data) return null;
    return data as { slug: string; status: Restaurant['status'] };
  }
);

/**
 * Variante cacheada ENTRE requests de getRestaurantBySlug, solo para el menú
 * PÚBLICO sin sesión (src/app/page.tsx). El resto del panel (admin, mesero,
 * checkout, etc.) sigue usando getRestaurantBySlug: necesita la sesión del
 * usuario y su estado siempre al día.
 *
 * Dos niveles a propósito:
 *  1. slug → id, EN VIVO (no cacheado): lookup barato e indexado que además
 *     exige status='active'. Así una suspensión (Super Admin) se refleja de
 *     inmediato aunque la fila de abajo siga cacheada.
 *  2. fila completa (restaurant + theme) por id, cacheada 60s y con tag
 *     `restaurant:${id}` — invalidar ahí en toda acción que edite el
 *     restaurante o su tema (ver actions/restaurant.ts, actions/modules.ts).
 */
export async function getRestaurantBySlugCached(slug: string): Promise<RestaurantWithTheme | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const liveDb = createServiceClient();
  const { data: idRow } = await liveDb
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();

  if (!idRow) return null;

  const row = await fetchRestaurantByIdCached(idRow.id as string);
  if (!row) return null;

  const themeRow = row.theme ?? defaultTheme(row.restaurant.id);
  return {
    restaurant: row.restaurant,
    theme: themeRow,
    resolved: resolveTheme(themeRow, slug, {
      brandName: row.restaurant.name,
      tagline: row.restaurant.tagline,
    }),
  };
}

function fetchRestaurantByIdCached(restaurantId: string) {
  return unstable_cache(
    async (): Promise<{ restaurant: Restaurant; theme: RestaurantTheme | null } | null> => {
      const db = createServiceClient();
      const { data: restaurant } = await db.from('restaurants').select('*').eq('id', restaurantId).single();
      if (!restaurant) return null;

      const { data: theme } = await db
        .from('restaurant_themes')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .single();

      return { restaurant: restaurant as Restaurant, theme: (theme as RestaurantTheme) ?? null };
    },
    ['public-restaurant-by-id', restaurantId],
    { revalidate: 60, tags: [`restaurant:${restaurantId}`] },
  )();
}

function defaultTheme(restaurantId: string): RestaurantTheme {
  return {
    restaurant_id: restaurantId,
    brand_name: null,
    logo_url: null,
    color_primary: '#D97757',
    color_bg: '#0b0b0c',
    color_text: '#F5F3EF',
    font_display: 'Unbounded',
    portada_style: 'spotlight',
    catalog_view: 'grid',
    glass_intensity: 'translucido',
    background_image: null,
    config: null,
    content: null,
    custom_css: null,
  };
}
