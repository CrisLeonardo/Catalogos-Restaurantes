import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { Category, Product } from '@/types';

export type MenuData = {
  categories: Category[];
  products: Product[];
};

// Columnas que el menú PÚBLICO necesita. Excluye datos de negocio sensibles
// (cost/margen) e inventario (stock, track_stock, low_stock_threshold): RLS
// filtra filas pero NO columnas, así que un select('*') los serializaba al
// navegador del comensal (visibles en el payload de red). is_active lo filtra
// la política RLS `products_select_available`, no hace falta pedirlo.
export const PUBLIC_PRODUCT_COLUMNS =
  'id, category_id, name, name_en, description, description_en, price, image_url, icon, tags, dietary_tags, options, is_available, unavailable_at, sort_order';

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
        .select('id, name, name_en, icon, sort_order, availability')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq('restaurant_id', restaurantId)
        .order('sort_order'),
    ]);

    return {
      categories: (categories as Category[]) ?? [],
      products: (products as Product[]) ?? [],
    };
  }
);

/**
 * Variante cacheada ENTRE requests de getMenuData, solo para el menú
 * PÚBLICO sin sesión (src/app/page.tsx) — cada escaneo de QR pegaba directo
 * a Supabase. Usa el cliente de servicio (sin cookies(), requisito de
 * unstable_cache) así que replica a mano el filtro que antes ponía RLS
 * (`products_select_available`: is_active = true).
 * Invalidar con revalidateTag(`menu:${restaurantId}`) en toda acción que
 * cree/edite/borre/reordene productos o categorías.
 */
export function getMenuDataCached(restaurantId: string): Promise<MenuData> {
  return unstable_cache(
    async () => {
      const db = createServiceClient();
      const [{ data: categories }, { data: products }] = await Promise.all([
        db
          .from('categories')
          .select('id, name, name_en, icon, sort_order, availability')
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .order('sort_order'),
        db
          .from('products')
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .order('sort_order'),
      ]);

      return {
        categories: (categories as Category[]) ?? [],
        products: (products as Product[]) ?? [],
      };
    },
    ['public-menu-data', restaurantId],
    { revalidate: 60, tags: [`menu:${restaurantId}`] },
  )();
}
