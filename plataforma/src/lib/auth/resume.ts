import 'server-only';
import { myOrganizationId } from '@/lib/db/admin';

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
