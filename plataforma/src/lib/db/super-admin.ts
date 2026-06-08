import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import type { Restaurant, RestaurantTheme } from '@/types';

export type RestaurantRow = Restaurant & {
  restaurant_themes: RestaurantTheme[];
};

export type GlobalMetrics = {
  total: number;
  active: number;
  suspended: number;
  premium: number;
  catalogo: number;
};

export const getAllRestaurants = cache(async (): Promise<RestaurantRow[]> => {
  const db = createServiceClient();
  const { data } = await db
    .from('restaurants')
    .select('*, restaurant_themes(*)')
    .order('created_at', { ascending: false });
  return (data ?? []) as RestaurantRow[];
});

export const getRestaurantFullById = cache(
  async (id: string): Promise<RestaurantRow | null> => {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurants')
      .select('*, restaurant_themes(*)')
      .eq('id', id)
      .single();
    return (data as RestaurantRow) ?? null;
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
