import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Category, Product } from '@/types';

export type MenuData = {
  categories: Category[];
  products: Product[];
};

/**
 * Carga categorías y productos activos de un restaurante en una sola request.
 * Cached por request para evitar queries duplicadas.
 */
export const getMenuData = cache(
  async (restaurantId: string): Promise<MenuData> => {
    const supabase = await createClient();

    const [{ data: categories }, { data: products }] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('sort_order'),
    ]);

    return {
      categories: (categories as Category[]) ?? [],
      products: (products as Product[]) ?? [],
    };
  }
);
