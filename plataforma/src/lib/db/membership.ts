import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { LEGACY_ROLE, type MemberRole, type Membership, type MembershipCard } from '@/lib/membership-roles';

/* ============================================================
   MEMBRESÍAS — una persona, varios restaurantes (migración 113)
   ------------------------------------------------------------
   Separa las dos preguntas que antes estaban pegadas en una sola fila de
   `profiles`:

     · QUIÉN ERES    → tu usuario de Auth. Uno, para siempre.
     · QUÉ ERES AQUÍ → tu fila en restaurant_members, una por restaurante.

   Todo lo de aquí lee con el cliente de SERVICIO a propósito: el candado no
   es RLS sino la propia consulta (`user_id = <el de la sesión>`), y así
   funciona igual en el subdominio de cualquier restaurante, que es
   justamente el caso que hay que resolver.
   ============================================================ */

export type { MemberRole, Membership, MembershipCard } from '@/lib/membership-roles';
export { roleLabel, canBill, canManageStaff } from '@/lib/membership-roles';

/**
 * Membresías del usuario autenticado, sin datos del restaurante.
 * Cacheada por petición: la consultan el candado de tenant, el destino del
 * login y la pantalla Mi cuenta, todos en el mismo render.
 */
export const getMyMemberships = cache(async (): Promise<Membership[]> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  return listMembershipsOf(user.id);
});

/** Membresías activas de un usuario concreto. */
export async function listMembershipsOf(userId: string): Promise<Membership[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurant_members')
      .select('restaurant_id, role, permissions')
      .eq('user_id', userId)
      .eq('status', 'active');

    return (data ?? []).map((m) => ({
      restaurantId: m.restaurant_id as string,
      role: m.role as MemberRole,
      permissions: (m.permissions as string[] | null) ?? null,
    }));
  } catch {
    // Migración 112 sin aplicar: sin membresías, todo el sistema cae al
    // camino de siempre (profiles.restaurant_id). Nadie se queda fuera.
    return [];
  }
}

/** La membresía del usuario autenticado en ESTE restaurante, o null. */
export async function getMyMembership(restaurantId: string): Promise<Membership | null> {
  const all = await getMyMemberships();
  return all.find((m) => m.restaurantId === restaurantId) ?? null;
}

/**
 * Sobre QUÉ restaurante actúa una server action llamada desde este subdominio.
 *
 * `profiles.restaurant_id` es un solo id: el "restaurante de casa". Para quien
 * tiene uno, es siempre la respuesta correcta y esta función lo devuelve tal
 * cual. Para quien tiene varios, no: estando en el panel del restaurante B,
 * su perfil sigue apuntando a A, y sin esto CADA acción del panel —cambiar un
 * precio, apagar los pedidos, borrar una categoría— escribiría en A mientras
 * la pantalla dice B. No es un fallo de permisos: es escribir en el negocio
 * equivocado.
 *
 * Misma idea que `resolveGroupBranchId()` para el dueño de grupo, y por eso
 * se usa en el mismo sitio de cada acción: al calcular su `restaurantId`.
 */
export async function resolveOwnRestaurantId(
  profileRestaurantId: string | null | undefined,
): Promise<string | null> {
  const tenantSlug = (await headers()).get('x-tenant-slug');
  if (!tenantSlug) return profileRestaurantId ?? null;

  const db = createServiceClient();
  const { data: tenant } = await db
    .from('restaurants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (!tenant) return profileRestaurantId ?? null;

  const tenantId = tenant.id as string;
  if (tenantId === profileRestaurantId) return tenantId;

  // Solo se acepta el restaurante del subdominio si de verdad es suyo. Sin
  // membresía se devuelve el de siempre, y el candado de tenant (que corre
  // en el layout) ya habrá impedido que esta persona esté viendo esa página.
  return (await getMyMembership(tenantId)) ? tenantId : (profileRestaurantId ?? null);
}

/**
 * ¿Puede esta persona actuar sobre este restaurante?
 *
 * El compañero de `resolveOwnRestaurantId` para las acciones que reciben el
 * id del restaurante y solo tienen que comprobarlo. Antes ese chequeo era
 * `profile.restaurant_id !== restaurantId → no autorizado`, que para quien
 * tiene dos restaurantes rechaza el suyo propio. Falla del lado seguro —niega
 * de más, nunca de menos— pero deja al dueño fuera de su segundo negocio.
 */
export async function canActOnRestaurant(
  profileRestaurantId: string | null | undefined,
  restaurantId: string | null | undefined,
): Promise<boolean> {
  if (!restaurantId) return false;
  if (profileRestaurantId === restaurantId) return true;
  return !!(await getMyMembership(restaurantId));
}

export type EffectiveRole = {
  role: string;
  permissions: string[] | null;
  /** Se resolvió por membresía en el restaurante del subdominio. */
  isMember: boolean;
  memberRole: MemberRole | null;
};

/**
 * Qué es esta persona EN ESTE restaurante.
 *
 * Las pantallas que no pasan por getAdminContext (mesero, cocina) leen el rol
 * y los permisos directo del perfil, y el perfil solo sabe de UN restaurante.
 * Sin esto, alguien que es mesero en la sucursal B pero cajero en su propio
 * local A entraría a B con los permisos de A — o no entraría.
 *
 * Sin membresía devuelve el rol del perfil tal cual: el camino de siempre,
 * intacto.
 */
export async function resolveEffectiveRole(
  profile: { role: string | null; permissions: string[] | null },
  tenantRestaurantId: string | null,
): Promise<EffectiveRole> {
  const fallback: EffectiveRole = {
    role: profile.role ?? '',
    permissions: profile.permissions ?? null,
    isMember: false,
    memberRole: null,
  };

  // El super admin nunca se resuelve por membresía: si tuviera una, su rol
  // efectivo pasaría a ser el de esa membresía —RESTAURANT_OWNER o menos— y
  // perdería su propio panel. Su acceso ya lo resuelve el candado de tenant.
  if (!tenantRestaurantId || profile.role === 'SUPER_ADMIN') return fallback;

  const membership = await getMyMembership(tenantRestaurantId);
  if (!membership) return fallback;

  return {
    role: LEGACY_ROLE[membership.role],
    permissions: membership.permissions,
    isMember: true,
    memberRole: membership.role,
  };
}

/**
 * Las tarjetas de Mi cuenta: membresías + los datos del restaurante que se
 * pintan. Una sola consulta para todos los restaurantes, no una por tarjeta.
 */
export async function getMyRestaurantCards(): Promise<MembershipCard[]> {
  const memberships = await getMyMemberships();
  if (memberships.length === 0) return [];

  const db = createServiceClient();
  const ids = memberships.map((m) => m.restaurantId);

  const [{ data: restaurants }, { data: themes }] = await Promise.all([
    // `entry_pin_hash` (migración 113) va aquí porque esta pantalla no existe
    // sin esa misma migración: si no hay membresías, no hay tarjetas que
    // pintar y no se llega hasta aquí.
    db.from('restaurants').select('id, name, slug, orders_paused, entry_pin_hash').in('id', ids),
    db.from('restaurant_themes').select('restaurant_id, logo_url').in('restaurant_id', ids),
  ]);

  const logoById = new Map<string, string | null>(
    (themes ?? []).map((t) => [t.restaurant_id as string, (t.logo_url as string | null) ?? null]),
  );

  const cards: MembershipCard[] = [];
  for (const m of memberships) {
    const r = (restaurants ?? []).find((x) => x.id === m.restaurantId);
    if (!r) continue; // restaurante borrado: la membresía huérfana no se pinta
    cards.push({
      ...m,
      name: r.name as string,
      slug: r.slug as string,
      logoUrl: logoById.get(m.restaurantId) ?? null,
      paused: r.orders_paused === true,
      locked: !!r.entry_pin_hash,
    });
  }

  // El dueño primero, y dentro de cada rol por nombre: en una cadena, la
  // tarjeta que se busca es casi siempre la del negocio propio.
  const rank: Record<MemberRole, number> = { OWNER: 0, MANAGER: 1, STAFF: 2, WAITER: 3 };
  return cards.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
}

/* El panel consolidado ya no vive aquí. Antes esta capa exportaba
   `getMyGroupPanel()`, que decidía si había grupo mirando
   `profiles.organization_id` —una fila que solo Leogin creaba— y devolvía un
   enlace a otro subdominio. Hoy el grupo se deduce de las membresías de
   dueño y el panel es una sección más de Mi cuenta: ver
   `getMyGroupScope()` en lib/db/group.ts. */
