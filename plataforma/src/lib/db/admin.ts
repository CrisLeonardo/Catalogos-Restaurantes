import { cache } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getMyMemberships } from '@/lib/db/membership';
import { type MemberRole } from '@/lib/membership-roles';
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

/** Cómo se ve una membresía desde el rol de perfil de toda la vida. El panel
    entero razona con estos, así que la membresía se traduce en memoria en vez
    de reescribir treinta páginas. */
const LEGACY_ROLE: Record<MemberRole, Profile['role']> = {
  OWNER: 'RESTAURANT_OWNER',
  MANAGER: 'RESTAURANT_STAFF',
  STAFF: 'RESTAURANT_STAFF',
  WAITER: 'RESTAURANT_WAITER',
};

export type AdminContext = {
  userId: string;
  profile: Profile;
  restaurant: Restaurant | null;
  theme: RestaurantTheme | null;
  /**
   * Rol en ESTE restaurante según las membresías (migración 112), cuando se
   * entró por esa vía. null = se entró por el camino de siempre
   * (`profiles.restaurant_id`), que sigue vivo.
   *
   * Existe aparte de `profile.role` porque son preguntas distintas: el perfil
   * dice quién eres en la plataforma, la membresía dice qué eres AQUÍ. Un
   * gerente de la sucursal B puede ser dueño de su propio restaurante A.
   */
  memberRole: MemberRole | null;
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
  let memberRole: MemberRole | null = null;

  /* ── Membresías (migración 112) ───────────────────────────────────────
     Va PRIMERO porque es la única vía que sabe resolver "estoy en el
     subdominio del restaurante B y también soy de B", que es justo lo que
     `profiles.restaurant_id` —un solo id— no puede contestar. Sin esto, un
     dueño con dos restaurantes abría el panel de B y veía los datos de A.

     El SUPER_ADMIN se queda fuera a propósito: su acceso a un restaurante
     ajeno pasa por el pase de soporte (support-session.ts), que deja rastro
     en la bitácora; una membresía se lo daría en silencio. */
  const tenantSlug = (await headers()).get('x-tenant-slug');
  if (tenantSlug && profile.role !== 'SUPER_ADMIN') {
    const tenant = await getRestaurantBySlug(tenantSlug);
    if (tenant) {
      const membership = (await getMyMemberships()).find(
        (m) => m.restaurantId === tenant.restaurant.id,
      );
      if (membership) {
        restaurant = tenant.restaurant;
        theme = tenant.theme;
        memberRole = membership.role;
        // Se fijan EN MEMORIA (nunca se escriben) para que las ~30 páginas
        // del panel, que leen ctx.profile.restaurant_id y ctx.profile.
        // permissions, operen sobre este restaurante sin tocarlas una por
        // una. La verdad en la base de datos sigue siendo la membresía.
        const p = profile as Profile;
        p.restaurant_id = tenant.restaurant.id;
        p.role = LEGACY_ROLE[membership.role];
        p.permissions = membership.permissions;
      }
    }
  }

  if (restaurant) {
    // Ya resuelto por membresía.
  } else if (profile.restaurant_id) {
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
    // (x-tenant-slug). Se fija `profile.restaurant_id` en memoria para que
    // TODAS las páginas admin (que usan ctx.profile.restaurant_id /
    // ctx.restaurant) operen sobre esa sucursal sin cambios página por página.
    //
    // SEGURIDAD: getRestaurantBySlug NO alcanza como candado. Las políticas de
    // RLS se combinan con OR y `restaurants_select_active` (PUBLIC, USING
    // status = 'active') deja leer CUALQUIER restaurante activo — el menú
    // público lo necesita. Sin la comparación explícita de organization_id de
    // abajo, un dueño de grupo que navegara al subdominio admin de otro
    // restaurante entraba a su panel, y como casi todas las consultas del
    // panel usan el cliente de servicio (que salta RLS), veía pedidos,
    // clientes y finanzas ajenos. La pertenencia se verifica aquí, en el
    // servidor, contra el organization_id de su propio perfil.
    const branch = await getRestaurantBySlug((await headers()).get('x-tenant-slug') ?? '');
    const sameOrg =
      !!branch &&
      !!profile.organization_id &&
      branch.restaurant.organization_id === profile.organization_id;
    if (sameOrg) {
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
    memberRole,
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
