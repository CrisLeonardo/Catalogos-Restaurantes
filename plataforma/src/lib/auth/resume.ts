import 'server-only';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isMeseroOnly } from '@/lib/permissions';
import { adminUrl } from '@/lib/tenant';

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

  if (profile.role === 'SUPER_ADMIN') return { name, url: '/super/restaurantes' };
  if (profile.role === 'GROUP_OWNER') return { name, url: '/central' };
  if (!profile.restaurant_id) return null;

  const { data: rest } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('id', profile.restaurant_id)
    .single();
  if (!rest?.slug) return null;

  const mesero = isMeseroOnly(profile.role, profile.permissions as string[] | null);
  const tenantSlug = (await headers()).get('x-tenant-slug');

  // Mismo criterio que login(): si ya estamos en el subdominio de SU
  // restaurante, destino relativo; si no, URL absoluta a su panel.
  if (rest.slug === tenantSlug) {
    return { name, url: mesero ? '/admin/mesero' : '/admin/menu' };
  }
  const base = adminUrl(rest.slug);
  return { name, url: mesero ? `${base}/mesero` : `${base}/menu` };
}
