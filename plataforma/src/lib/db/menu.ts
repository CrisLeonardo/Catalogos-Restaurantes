import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { Category, Product } from '@/types';
import { isOutOfStock } from '@/lib/product-availability';

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
 * Lo que se le PIDE a la base para el menú público: lo de arriba más el
 * inventario, que se usa aquí dentro y NO sale hacia el navegador.
 *
 * Hace falta porque `place_order` marca un platillo agotado CON hora al
 * llegar a cero de existencias, y el menú lo devuelve solo a las 12 h
 * (lib/product-availability.ts). Sin saber del stock, el comensal volvía a
 * ver con su «+» algo que el servidor iba a rechazar por falta de
 * existencias (auditoría 2026-10-02, CAT-01).
 */
const MENU_QUERY_COLUMNS = `${PUBLIC_PRODUCT_COLUMNS}, track_stock, stock`;

/** Quita el inventario de cada fila y, si no hay existencias, la deja
 *  «agotada sin reloj» (sin `unavailable_at` no vuelve sola). */
function toPublicProducts(rows: Record<string, unknown>[] | null): Product[] {
  return (rows ?? []).map((row) => {
    const { track_stock, stock, ...p } = row;
    if (isOutOfStock({ track_stock: track_stock as boolean | null, stock: stock as number | null })) {
      return { ...p, is_available: false, unavailable_at: null } as unknown as Product;
    }
    return p as unknown as Product;
  });
}

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
        .select(MENU_QUERY_COLUMNS)
        .eq('restaurant_id', restaurantId)
        .order('sort_order'),
    ]);

    return {
      categories: (categories as Category[]) ?? [],
      products: toPublicProducts(products as Record<string, unknown>[] | null),
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
          .select(MENU_QUERY_COLUMNS)
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .order('sort_order'),
      ]);

      return {
        categories: (categories as Category[]) ?? [],
        products: toPublicProducts(products as Record<string, unknown>[] | null),
      };
    },
    ['public-menu-data', restaurantId],
    { revalidate: 60, tags: [`menu:${restaurantId}`] },
  )();
}

/**
 * EL CATÁLOGO DEL MESERO, CACHEADO ENTRE PETICIONES (M-23)
 * ------------------------------------------------------------
 * `mesero/page.tsx` pedía `categories` y `products` completos en el mismo
 * `Promise.all` que la ocupación de las mesas. Y `useSalonLive` dispara
 * `router.refresh()` ante cualquier cambio en `orders` o `waiter_calls`
 * —hasta cada 2,5 s en hora pico—, así que el menú entero se volvía a
 * consultar en Postgres con cada plato que cocina aceptaba. Medido: 5 de
 * 5 cargas hicieron su `select products.*`, y un solo evento costó 24,2 KB
 * de recarga con un menú de SEIS platos.
 *
 * Los productos cambian una vez al día; la ocupación, cada minuto. Aquí se
 * separan: la ocupación sigue viniendo fresca en cada refresco y el
 * catálogo se sirve de la caché, con la MISMA etiqueta `menu:<id>` que ya
 * invalidan todas las acciones de productos, categorías e inventario. O
 * sea que un cambio de carta se ve al instante, igual que hoy.
 *
 * Se piden las columnas completas a propósito —el panel del mesero es
 * interno y ya las recibía— para que este cambio sea de RENDIMIENTO y no
 * cambie ni un dato de lo que la pantalla enseña.
 *
 * El minuto de `revalidate` es el techo del único caso que la etiqueta no
 * cubre: `place_order` puede agotar un producto desde SQL sin pasar por
 * una acción que invalide. Es el mismo compromiso que ya tenía el menú
 * público.
 */
export function getWaiterCatalogCached(restaurantId: string): Promise<MenuData> {
  return unstable_cache(
    async () => {
      const db = createServiceClient();
      const [{ data: categories }, { data: products }] = await Promise.all([
        db.from('categories').select('*')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
        db.from('products').select('*')
          .eq('restaurant_id', restaurantId)
          .order('sort_order', { ascending: true }),
      ]);

      return {
        categories: (categories as Category[]) ?? [],
        products: (products as Product[]) ?? [],
      };
    },
    ['waiter-catalog', restaurantId],
    { revalidate: 60, tags: [`menu:${restaurantId}`] },
  )();
}
