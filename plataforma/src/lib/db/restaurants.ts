import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Restaurant, RestaurantTheme } from '@/types';

export type RestaurantWithTheme = {
  restaurant: Restaurant;
  theme: RestaurantTheme;
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

    return {
      restaurant: restaurant as Restaurant,
      theme: (theme as RestaurantTheme) ?? defaultTheme(restaurant.id as string),
    };
  }
);

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
  };
}
