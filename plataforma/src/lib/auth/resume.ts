import 'server-only';
import { myOrganizationId } from '@/lib/db/admin';
import { getRestaurantSlugById } from '@/lib/db/restaurants';

import { cookies, headers } from 'next/headers';
import { createClient, getStaffUser } from '@/lib/supabase/server';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { isLowPrivilegeRole, shouldHideResume } from '@/lib/auth/resume-policy';
import { SESSION_SEEN_COOKIE, isSessionStale } from '@/lib/auth/session-activity';

/**
 * Sesión de personal ya iniciada, lista para "Continuar como {nombre}" en las
 * páginas de login (patrón Netflix/Steam: si el dispositivo ya te conoce, no
 * te vuelve a pedir la contraseña — solo confirma quién eres).
 *
 * Por qué existe: la cookie de sesión del personal se comparte en todo el
 * dominio raíz (`domain=.leogin.online`, ver proxy.ts). Al abrir el login
 * central (p. ej. cada arranque de Leogin Desktop antes de vincularse, o al
 * "cambiar de cuenta") es común que YA exista una sesión válida — pedir el
 * correo y la contraseña otra vez era pura fricción. Este helper resuelve el
 * mismo destino que calcularía `login()` (auth.ts) pero sin credenciales.
 *
 * Devuelve null si no hay sesión utilizable — el login se muestra normal.
 */
export type ResumeSession = {
  name: string;
  url: string;
  /**
   * STAFF/WAITER: es quien ya aparece en la grilla de PIN, así que su propio
   * atajo de "Continuar como" no abre ningún hueco nuevo en el aparato del
   * local. OWNER/SUPER_ADMIN (o cualquier otro rol que NO entra por PIN):
   * `false` — es la sesión que este helper esconde en un aparato de
   * confianza (ver `pinTrusted` abajo).
   */
  lowPrivilege: boolean;
};

/**
 * A qué restaurante mandar un login "en seco" (dominio raíz, sin slug): el de
 * la sesión de personal que YA está viva en este aparato, y solo si no hay,
 * el que el aparato tiene registrado por PIN.
 *
 * Reportado el 2026-10-08: entrar con el usuario de un restaurante, salir,
 * entrar con el de otro y volver a abrir el ícono de Leogin llevaba a la
 * grilla de PIN del primero. La pista del aparato (`restaurant_devices`) solo se actualiza
 * con un PIN correcto —nunca con un login de correo y contraseña—, así que
 * seguía apuntando al restaurante viejo aunque la sesión viva fuera de otro.
 * Y como en un aparato de confianza el "Continuar como" de un dueño se
 * esconde, la sesión viva del segundo ni siquiera se ofrecía.
 */
export async function getBareLoginSlug(deviceRestaurantId: string | null): Promise<string | null> {
  let restaurantId = deviceRestaurantId;
  try {
    const { data: { user } } = await getStaffUser();
    if (user) {
      const seen = (await cookies()).get(SESSION_SEEN_COOKIE)?.value;
      if (!isSessionStale(seen, user.id)) {
        const supabase = await createClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('restaurant_id')
          .eq('id', user.id)
          .single();
        if (profile?.restaurant_id) restaurantId = profile.restaurant_id as string;
      }
    }
  } catch {
    /* sin sesión utilizable → manda la pista del aparato */
  }
  if (!restaurantId) return null;
  const known = await getRestaurantSlugById(restaurantId);
  if (known?.status === 'active') return known.slug;
  // La sesión apuntaba a un restaurante que ya no está activo: se cae a la
  // pista del aparato antes de rendirse.
  if (restaurantId !== deviceRestaurantId && deviceRestaurantId) {
    const viaDevice = await getRestaurantSlugById(deviceRestaurantId);
    if (viaDevice?.status === 'active') return viaDevice.slug;
  }
  return null;
}

export async function getResumeSession(
  opts: { restaurantId?: string | null; pinTrusted?: boolean } = {},
): Promise<ResumeSession | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  /* Vencida por inactividad: NO se ofrece continuar.
     La cookie de Supabase puede seguir viva días, pero los layouts de destino
     (mi-cuenta, admin, super) aplican su propia ventana de 30 min y rebotan a
     /admin/logout-operator. Sin esta comprobación, "Continuar como {nombre}"
     prometía algo que la pantalla siguiente deshacía: el dueño pulsaba su
     nombre y aterrizaba de vuelta en el login con la sesión ya cerrada, que
     es exactamente lo que se reportó el 2026-09-02. Un solo reloj para las
     dos pantallas — el mismo `isSessionStale` que usan los layouts. */
  const seen = (await cookies()).get(SESSION_SEEN_COOKIE)?.value;
  if (isSessionStale(seen, user.id)) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, full_name, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const lowPrivilege = isLowPrivilegeRole(profile.role as string);
  // Aparato de confianza del local: la grilla de PIN manda para cualquier
  // sesión de rol alto (dueño, super admin), sin importar de qué restaurante
  // sea esa sesión vieja — es la protección del §1-2 del checklist de
  // 2026-08-25. Regla centralizada en resume-policy.ts (con sus tests) para
  // que esta comprobación y la de login-client.tsx no puedan desincronizarse.
  if (shouldHideResume(!!opts.pinTrusted, profile.role as string)) return null;

  const name = (profile.full_name as string | null) || user.email || 'tu cuenta';
  // Sin restaurante propio solo siguen el super admin y quien administra una
  // cadena (que entra por su organización, no por su restaurant_id).
  if (!profile.restaurant_id && profile.role !== 'SUPER_ADMIN' && !(await myOrganizationId())) return null;

  const tenantSlug = (await headers()).get('x-tenant-slug');
  const url = await resolveStaffDestination(
    supabase,
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    tenantSlug,
  );
  // resolveStaffDestination cae a /admin/login cuando no pudo resolver el
  // restaurante (perfil huérfano) — ahí no hay nada útil que "continuar".
  if (url === '/admin/login') return null;
  return { name, url, lowPrivilege };
}
