import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import type { Profile, Restaurant, RestaurantTheme } from '@/types';

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
