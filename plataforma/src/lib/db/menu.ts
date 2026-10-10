import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { Category, Product } from '@/types';
import { isOutOfStock } from '@/lib/product-availability';

export type MenuData = {
  categories: Category[];
  products: Product[];
  /**
   * Existencias que quedan, SOLO de los productos con inventario y pocas
   * unidades (≤ STOCK_LEFT_CAP). Viaja aparte de `products` a propósito: quien
   * pasa `products` al navegador (checkout, landing…) no se lleva el
   * inventario sin darse cuenta. Lo pega al producto `withStockLeft`, y solo
   * si el dueño encendió «Quedan pocas».
   */
  stockLeft: Record<string, number>;
};

/** Tope de lo que se guarda en `stockLeft`: el máximo que el editor deja
    elegir como umbral de «Quedan pocas». */
export const STOCK_LEFT_CAP = 50;

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

/** Las existencias bajas de cada producto con inventario (ver MenuData.stockLeft). */
function toStockLeft(rows: Record<string, unknown>[] | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    const stock = row.stock as number | null;
    if (row.track_stock === true && typeof stock === 'number' && stock > 0 && stock <= STOCK_LEFT_CAP) {
      out[row.id as string] = stock;
    }
  }
  return out;
}

/**
 * Pega a cada producto las unidades que le quedan (`stock_left`), solo si el
 * dueño encendió «Quedan pocas» y solo por debajo de su umbral. Sin eso
 * devuelve los productos tal cual: el inventario no sale del servidor.
 *
 * `all` es para la vista previa del editor: ahí el dueño mueve el umbral en
 * vivo, así que se manda todo lo bajo y el catálogo filtra con la config.
 */
export function withStockLeft<T extends { id: string }>(
  products: T[],
  stockLeft: Record<string, number> | undefined,
  config: { showStockLeft: boolean; stockLeftBelow: number },
  all = false,
): Array<T & { stock_left?: number }> {
  if (!all && !config.showStockLeft) return products;
  return products.map((p) => {
    const left = stockLeft?.[p.id];
    return left !== undefined && (all || left <= config.stockLeftBelow) ? { ...p, stock_left: left } : p;
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
      stockLeft: toStockLeft(products as Record<string, unknown>[] | null),
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
        stockLeft: toStockLeft(products as Record<string, unknown>[] | null),
      };
    },
    // v2: la forma cambió (llegó `stockLeft`); una entrada vieja de la caché
    // no lo traería.
    ['public-menu-data-v2', restaurantId],
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
export function getWaiterCatalogCached(restaurantId: string): Promise<Omit<MenuData, 'stockLeft'>> {
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

/**
 * LO MÁS PEDIDO EN 30 DÍAS (auditoría 2026-10-02, CAT-09)
 * ------------------------------------------------------------
 * Ids de producto de más a menos unidades vendidas, para ofrecer «Lo más
 * pedido» en el checkout cuando el carrito está vacío. Solo ids: el nombre
 * y el precio salen de la carta pública (`getMenuDataCached`), así que
 * aquí no viaja nada que el menú no enseñe ya. Una hora de caché: es una
 * sugerencia, no un reporte.
 */
export function getTopSellingProductIdsCached(restaurantId: string): Promise<string[]> {
  return unstable_cache(
    async () => {
      if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return [];
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const db = createServiceClient();
      const { data, error } = await db
        .from('order_items')
        .select('product_id, quantity, order:orders!inner(restaurant_id, created_at, status)')
        .eq('order.restaurant_id', restaurantId)
        .gte('order.created_at', since)
        .neq('order.status', 'CANCEL')
        .not('product_id', 'is', null)
        .limit(2000);
      if (error || !data) return [];
      const unidades = new Map<string, number>();
      for (const row of data as { product_id: string | null; quantity: number }[]) {
        if (!row.product_id) continue;
        unidades.set(row.product_id, (unidades.get(row.product_id) ?? 0) + (Number(row.quantity) || 0));
      }
      return [...unidades.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    },
    ['top-selling-products', restaurantId],
    { revalidate: 3600 },
  )();
}
