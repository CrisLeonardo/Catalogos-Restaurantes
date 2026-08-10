'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { logPanelAccess } from '@/lib/auth/access-log';

export type AuthState = { error: string } | null;

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email y contraseña son requeridos.' };
  }

  // Anti fuerza bruta: límite por IP (10 intentos / 5 min) y por IP+email.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`login:${ip}`, 10, 5 * 60_000)) ||
      !(await rateLimit(`login:${ip}:${email.toLowerCase()}`, 6, 5 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: 'Email o contraseña incorrectos.' };

  // Redirigir según rol
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', signInData.user.id)
    .single();

  if (!profile) redirect('/admin/login');

  // Bitácora de accesos (migración 109): el dueño la ve en /admin/personal.
  await logPanelAccess({
    profileId: signInData.user.id,
    restaurantId: (profile.restaurant_id as string | null) ?? null,
    method: 'password',
    headers: await headers(),
  });

  // Redirigir al subdominio del restaurante SIEMPRE que no sea ya el actual —
  // no solo cuando el login se hizo desde el dominio raíz. Antes esto solo
  // comparaba "¿estamos en la raíz?" (isRootDomain), así que loguearse con la
  // cuenta del restaurante B mientras se está en el subdominio del
  // restaurante A caía al `redirect('/admin/menu')` relativo de más abajo —
  // se quedaba en A y el candado de tenant de (protected)/layout.tsx
  // terminaba mandando al menú PÚBLICO de A en vez de al panel de B (bug
  // real: cuenta nueva de otro restaurante "no reconocida" solo en el
  // desktop, porque ahí es común arrancar ya posicionado en el subdominio de
  // un restaurante distinto al de la cuenta que se está probando).
  const tenantSlug = (await headers()).get('x-tenant-slug');

  redirect(await resolveStaffDestination(supabase, profile as { role: string; permissions: string[] | null; restaurant_id: string | null }, tenantSlug, '?welcome=1'));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/admin/login');
}

/** Logout desde el panel de grupo (vuelve al login del grupo). */
export async function logoutGroup() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/central/login');
}
