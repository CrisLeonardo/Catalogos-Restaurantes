import { cache } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import type { Category, Product, Profile, Restaurant, RestaurantTheme } from '@/types';

/**
 * Id de la sucursal que un DUEÑO DE GRUPO está administrando, resuelta desde el
 * subdominio admin actual (`x-tenant-slug`) y VERIFICANDO que pertenece a su
 * organización. Es el candado de seguridad de las server actions: aunque el
 * dueño de grupo navegue a otro subdominio, esta función solo devuelve el id si
 * la sucursal es de SU grupo (de lo contrario null → la acción se rechaza).
 *
 * Autónoma: recarga usuario + perfil con el cliente de servicio, así cualquier
 * acción puede llamarla sin pedir `organization_id` en su propio select.
 * Devuelve null si el usuario no es GROUP_OWNER o la sucursal no es de su grupo.
 */
export async function resolveGroupBranchId(): Promise<string | null> {
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();
  const { data: prof } = await svc
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!prof || prof.role !== 'GROUP_OWNER' || !prof.organization_id) return null;

  const { data: branch } = await svc
    .from('restaurants')
    .select('id, organization_id')
    .eq('slug', slug)
    .maybeSingle();
  if (!branch || branch.organization_id !== prof.organization_id) return null;

  return branch.id as string;
}

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
  } else if (profile.role === 'GROUP_OWNER') {
    // Dueño de grupo "entrando" a una sucursal: se resuelve por el subdominio
    // (x-tenant-slug). El cliente RLS + migración 053 solo devuelven la fila si
    // la sucursal pertenece a su organización (candado de seguridad). Se fija
    // `profile.restaurant_id` en memoria para que TODAS las páginas admin (que
    // usan ctx.profile.restaurant_id / ctx.restaurant) operen sobre esa
    // sucursal sin cambios página por página.
    const branch = await getRestaurantBySlug((await headers()).get('x-tenant-slug') ?? '');
    if (branch) {
      restaurant = branch.restaurant;
      theme = branch.theme;
      (profile as Profile).restaurant_id = branch.restaurant.id;
    }
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
