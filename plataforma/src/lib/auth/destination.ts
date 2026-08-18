import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isMeseroOnly } from '@/lib/permissions';
import { getMyMemberships } from '@/lib/db/membership';
import { adminUrl } from '@/lib/tenant';

type ProfileLike = {
  role: string | null;
  permissions: string[] | null;
  restaurant_id: string | null;
};

/**
 * A dónde debe entrar un perfil ya autenticado, dado el subdominio actual.
 * Mismo criterio en los tres puntos de entrada del personal: login()
 * (email+contraseña), getResumeSession() ("Continuar como") y
 * verifyStaffPin() (PIN) — antes estaba triplicado.
 *
 * SUPER_ADMIN/GROUP_OWNER van a su panel propio. El resto entra a SU
 * restaurante: relativo si el subdominio actual ya es el suyo, absoluto
 * (con adminUrl) si no. Mesero puro → /mesero, si no → /menu.
 */
export async function resolveStaffDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: ProfileLike,
  tenantSlug: string | null,
  suffix = '',
): Promise<string> {
  if (profile.role === 'SUPER_ADMIN') return '/super/restaurantes';
  if (profile.role === 'GROUP_OWNER') return '/central';

  /* Con más de un restaurante (migración 113), a Mi cuenta a elegir.
     Con UNO SOLO se entra directo, sin selector: el 90% de los clientes tiene
     un solo local y la mejora para quien tiene tres no puede costarle un
     toque a quien tiene uno. Esa es la regla, y por eso el corte es en 2. */
  const memberships = await getMyMemberships();
  if (memberships.length > 1) return `/mi-cuenta${suffix}`;
  if (memberships.length === 1 && !profile.restaurant_id) {
    // Perfil sin restaurante "de casa" pero con una membresía: se entra a esa.
    const { data: only } = await supabase
      .from('restaurants')
      .select('slug')
      .eq('id', memberships[0].restaurantId)
      .single();
    if (only?.slug) {
      return only.slug === tenantSlug
        ? `/admin/menu${suffix}`
        : `${adminUrl(only.slug as string)}/menu${suffix}`;
    }
  }

  if (!profile.restaurant_id) return '/admin/login';

  const { data: rest } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('id', profile.restaurant_id)
    .single();
  if (!rest?.slug) return '/admin/login';

  const mesero = isMeseroOnly(profile.role, profile.permissions);
  const page = mesero ? 'mesero' : 'menu';

  if (rest.slug === tenantSlug) return `/admin/${page}${suffix}`;
  return `${adminUrl(rest.slug)}/${page}${suffix}`;
}
