import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import type { Category, Product, Profile, Restaurant, RestaurantTheme } from '@/types';

export type RestaurantRow = Restaurant & {
  restaurant_themes: RestaurantTheme[];
};

export type RestaurantUser = {
  id: string;
  email: string | null;
  role: Profile['role'];
  full_name: string | null;
};

export type GlobalMetrics = {
  total: number;
  active: number;
  suspended: number;
  premium: number;
  catalogo: number;
};

// PostgREST trata el embed restaurant_themes como UNO-A-UNO (restaurant_id es
// PK y FK a la vez), así que lo devuelve como objeto (o null), NO como array.
// Normalizamos a array para que `row.restaurant_themes[0]` funcione siempre.
function normalizeThemes(row: Record<string, unknown>): RestaurantRow {
  const rt = row.restaurant_themes;
  row.restaurant_themes = rt ? (Array.isArray(rt) ? rt : [rt]) : [];
  return row as unknown as RestaurantRow;
}

export const getAllRestaurants = cache(async (): Promise<RestaurantRow[]> => {
  const db = createServiceClient();
  const { data } = await db
    .from('restaurants')
    .select('*, restaurant_themes(*)')
    .order('created_at', { ascending: false });
  return (data ?? []).map((r) => normalizeThemes(r as Record<string, unknown>));
});

export const getRestaurantFullById = cache(
  async (id: string): Promise<RestaurantRow | null> => {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurants')
      .select('*, restaurant_themes(*)')
      .eq('id', id)
      .single();
    return data ? normalizeThemes(data as Record<string, unknown>) : null;
  },
);

/**
 * Resumen del menú de un restaurante (TODAS las categorías y productos,
 * sin filtrar disponibilidad) vía service role. Para la vista previa del
 * panel admin que abre el Super Admin (/preview/admin/[id]).
 */
export const getRestaurantMenuOverview = cache(
  async (restaurantId: string): Promise<{ categories: Category[]; products: Product[] }> => {
    const db = createServiceClient();
    const [{ data: categories }, { data: products }] = await Promise.all([
      db.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
      db.from('products').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
    ]);
    return {
      categories: (categories ?? []) as Category[],
      products: (products ?? []) as Product[],
    };
  },
);

/**
 * Usuarios (logins) asociados a un restaurante: dueño y staff.
 * El email vive en auth.users, así que se resuelve con la Admin API
 * (service_role). El nº de usuarios por restaurante es pequeño.
 */
export const getRestaurantUsers = cache(
  async (restaurantId: string): Promise<RestaurantUser[]> => {
    const db = createServiceClient();
    const { data: profiles } = await db
      .from('profiles')
      .select('id, role, full_name')
      .eq('restaurant_id', restaurantId);

    if (!profiles?.length) return [];

    const users = await Promise.all(
      profiles.map(async (p) => {
        const { data } = await db.auth.admin.getUserById(p.id as string);
        return {
          id: p.id as string,
          email: data.user?.email ?? null,
          role: p.role as Profile['role'],
          full_name: (p.full_name as string | null) ?? null,
        };
      }),
    );

    // Dueños primero, luego staff; cada grupo por email.
    return users.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'RESTAURANT_OWNER' ? -1 : 1;
      return (a.email ?? '').localeCompare(b.email ?? '');
    });
  },
);

export const getGlobalMetrics = cache(async (): Promise<GlobalMetrics> => {
  const db = createServiceClient();
  const { data } = await db.from('restaurants').select('status, plan_actual');
  const rows = data ?? [];
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
    premium: rows.filter((r) => r.plan_actual === 'PREMIUM').length,
    catalogo: rows.filter((r) => r.plan_actual === 'CATALOGO').length,
  };
});

/* ── Visitas por restaurante (Super Admin) ─────────────────── */

export type RestaurantTraffic = {
  /** Visitas en los últimos 30 días. */
  visits30: number;
  /** Visitantes únicos en los últimos 30 días. */
  unique30: number;
  /** Pedidos en los últimos 30 días (sin cancelados). */
  orders30: number;
};

/**
 * Tráfico de TODOS los restaurantes (últimos 30 días) en 2 queries.
 * Para la página de métricas del Super Admin.
 */
export const getAllRestaurantsTraffic = cache(
  async (): Promise<Map<string, RestaurantTraffic>> => {
    const db = createServiceClient();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [{ data: visits }, { data: orders }] = await Promise.all([
      db
        .from('page_visits')
        .select('restaurant_id, visitor_id')
        .gte('created_at', sinceIso)
        .limit(100000),
      db
        .from('orders')
        .select('restaurant_id')
        .neq('status', 'CANCEL')
        .gte('created_at', sinceIso)
        .limit(100000),
    ]);

    const map = new Map<string, RestaurantTraffic>();
    const uniques = new Map<string, Set<string>>();

    for (const v of visits ?? []) {
      const id = v.restaurant_id as string;
      const t = map.get(id) ?? { visits30: 0, unique30: 0, orders30: 0 };
      t.visits30 += 1;
      map.set(id, t);
      let set = uniques.get(id);
      if (!set) { set = new Set(); uniques.set(id, set); }
      set.add(v.visitor_id as string);
    }
    for (const [id, set] of uniques) {
      const t = map.get(id);
      if (t) t.unique30 = set.size;
    }
    for (const o of orders ?? []) {
      const id = o.restaurant_id as string;
      const t = map.get(id) ?? { visits30: 0, unique30: 0, orders30: 0 };
      t.orders30 += 1;
      map.set(id, t);
    }
    return map;
  },
);
