'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMeseroOnly } from '@/lib/permissions';
import { adminUrl } from '@/lib/tenant';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export type AuthState = { error: string } | null;

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email y contraseña son requeridos.' };
  }

  // Anti fuerza bruta: límite por IP (10 intentos / 5 min) y por IP+email.
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 10, 5 * 60_000) ||
      !rateLimit(`login:${ip}:${email.toLowerCase()}`, 6, 5 * 60_000)) {
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

  if (profile?.role === 'SUPER_ADMIN') {
    redirect('/super/restaurantes');
  }

  // El jefe de grupo entra a su panel consolidado (host slug-central.dominio).
  if (profile?.role === 'GROUP_OWNER') {
    redirect('/central');
  }

  // Detectar si el login se hizo desde el dominio raíz (leogin.online) y no
  // desde el subdominio del restaurante. Si es así, redirigir al subdominio
  // correcto usando la URL absoluta para que la cookie de sesión quede en el host correcto.
  const tenantSlug = (await headers()).get('x-tenant-slug');
  const isRootDomain = !tenantSlug;

  if (isRootDomain && profile?.restaurant_id) {
    const { data: rest } = await supabase
      .from('restaurants')
      .select('slug')
      .eq('id', profile.restaurant_id)
      .single();

    if (rest?.slug) {
      const destination = isMeseroOnly(profile?.role, profile?.permissions as string[] | null)
        ? `${adminUrl(rest.slug)}/mesero`
        : `${adminUrl(rest.slug)}/menu`;
      redirect(destination);
    }
  }

  // El mesero puro entra directo a su panel de toma de pedidos.
  if (isMeseroOnly(profile?.role, profile?.permissions as string[] | null)) {
    redirect('/admin/mesero');
  }

  redirect('/admin/menu');
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
