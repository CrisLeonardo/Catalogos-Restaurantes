import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Category, Product, Profile, Restaurant, RestaurantTheme } from '@/types';

export type AdminContext = {
  userId: string;
  profile: Profile;
  restaurant: Restaurant | null;
  theme: RestaurantTheme | null;
};

/**
 * Contexto completo del admin autenticado: profile + restaurant + theme.
 * Cacheado por request con React.cache().
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  let restaurant: Restaurant | null = null;
  let theme: RestaurantTheme | null = null;

  if (profile.restaurant_id) {
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase
        .from('restaurants')
        .select('*')
        .eq('id', profile.restaurant_id)
        .single(),
      supabase
        .from('restaurant_themes')
        .select('*')
        .eq('restaurant_id', profile.restaurant_id)
        .single(),
    ]);
    restaurant = r as Restaurant ?? null;
    theme = t as RestaurantTheme ?? null;
  }

  return {
    userId: user.id,
    profile: profile as Profile,
    restaurant,
    theme,
  };
});

export type AdminMenu = {
  categories: Category[];
  products: Product[];
};

/**
 * Carga todas las categorías + productos del restaurante (sin filtrar
 * is_active ni is_available — el admin ve todo).
 */
export const getAdminMenu = cache(async (restaurantId: string): Promise<AdminMenu> => {
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
  ]);

  return {
    categories: (categories ?? []) as Category[],
    products: (products ?? []) as Product[],
  };
});

/** Carga un único producto por id (para la página de edición). */
export async function getProductById(
  productId: string,
  restaurantId: string,
): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .single();
  return (data as Product) ?? null;
}
