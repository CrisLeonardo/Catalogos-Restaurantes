import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isMeseroOnly } from '@/lib/permissions';
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
