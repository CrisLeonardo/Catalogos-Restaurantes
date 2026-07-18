import 'server-only';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveStaffDestination } from '@/lib/auth/destination';

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
export type ResumeSession = { name: string; url: string };

export async function getResumeSession(): Promise<ResumeSession | null> {
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
    .select('role, permissions, full_name, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const name = (profile.full_name as string | null) || user.email || 'tu cuenta';
  if (!profile.restaurant_id && profile.role !== 'SUPER_ADMIN' && profile.role !== 'GROUP_OWNER') return null;

  const tenantSlug = (await headers()).get('x-tenant-slug');
  const url = await resolveStaffDestination(
    supabase,
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    tenantSlug,
  );
  // resolveStaffDestination cae a /admin/login cuando no pudo resolver el
  // restaurante (perfil huérfano) — ahí no hay nada útil que "continuar".
  if (url === '/admin/login') return null;
  return { name, url };
}
