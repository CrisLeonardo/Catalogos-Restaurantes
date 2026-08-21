import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isMeseroOnly } from '@/lib/permissions';
import { getMyMemberships } from '@/lib/db/membership';
import { myOrganizationId } from '@/lib/db/admin';
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
 * El super admin va a su panel propio. El resto entra a SU restaurante:
 * relativo si el subdominio actual ya es el suyo, absoluto (con adminUrl) si
 * no. Mesero puro → /mesero, si no → /menu.
 */
export async function resolveStaffDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: ProfileLike,
  tenantSlug: string | null,
  suffix = '',
): Promise<string> {
  if (profile.role === 'SUPER_ADMIN') return '/super/restaurantes';

  /* Mi cuenta es la casa de la PERSONA: quien tiene restaurantes aterriza ahí
     y desde ahí entra al que quiera, tenga uno o tenga cinco.

     Antes se entraba directo cuando solo había uno, para ahorrarle un toque.
     Se cambió a propósito: ese atajo escondía la pantalla donde se crea otro
     local, se ve el plan y se invita al equipo, y quien tiene un restaurante
     hoy puede tener dos mañana — justamente lo que este modelo busca.

     El personal NO pasa por aquí: un cajero o un mesero no elige nada, tiene
     un solo sitio donde trabajar y entra directo. Por eso la condición mira
     si es DUEÑO de algo, no cuántas membresías tiene. */
  const memberships = await getMyMemberships();
  const isOwner = memberships.some((m) => m.role === 'OWNER');
  if (isOwner || memberships.length > 1) return `/mi-cuenta${suffix}`;

  /* Jefe de una cadena que Leogin armó a mano antes de este cambio: tiene
     organización pero ninguna membresía propia, así que la regla de arriba
     no lo alcanza. Su casa es el consolidado, que hoy es una sección de Mi
     cuenta (antes era `/central`, en otro subdominio). */
  if (memberships.length === 0 && (await myOrganizationId())) return `/mi-cuenta/resumen`;
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

  /* Cuenta sin ningún restaurante todavía: ni propio ni por membresía.
     Su casa es Mi cuenta, que es donde se crea el primero. Antes se le
     devolvía al login, y eso se lee como "tu acceso falló" cuando en
     realidad entró perfectamente — con Google es peor todavía, porque el
     rebote es idéntico al de un canje fallido. */
  if (!profile.restaurant_id) return `/mi-cuenta${suffix}`;

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
