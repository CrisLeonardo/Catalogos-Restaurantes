'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { logActivity } from '@/lib/activity';
import { logPanelAccess } from '@/lib/auth/access-log';
import { clientIp } from '@/lib/rate-limit';
import {
  mintSupportTicket, supportCookieOptions, SUPPORT_COOKIE, SUPPORT_TTL_MS,
} from '@/lib/auth/support-session';

/**
 * Concede el pase de soporte del Super Admin para el restaurante del
 * subdominio actual. Ver lib/auth/support-session.ts para el por qué.
 *
 * El restaurante NUNCA sale del formulario: se resuelve del subdominio en el
 * servidor. Si viniera del cliente, el pase se podría pedir para cualquier
 * restaurante desde cualquier parte.
 */
export async function grantSupportAccess(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'SUPER_ADMIN') redirect('/admin/login');

  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');
  if (!slug) redirect('/super/restaurantes');

  const tenant = await getRestaurantBySlug(slug);
  if (!tenant) redirect('/super/restaurantes');

  const store = await cookies();
  store.set(SUPPORT_COOKIE, mintSupportTicket(tenant.restaurant.id), {
    ...supportCookieOptions(),
    maxAge: SUPPORT_TTL_MS / 1000,
  });

  // Rastro en la bitácora DEL RESTAURANTE: el cliente tiene que poder ver que
  // alguien de la plataforma estuvo en su panel, y cuándo. Va en las dos
  // bitácoras: la de actividad (lo que el dueño mira a diario) y la de
  // accesos (donde revisa quién entró a su panel).
  await logActivity({
    restaurantId: tenant.restaurant.id,
    actorId: user.id,
    action: 'soporte',
    entity: (profile.full_name as string | null) ?? user.email ?? 'Leogin',
    meta: { ip: clientIp(headersList), agente: headersList.get('user-agent') ?? null },
  });
  await logPanelAccess({
    profileId: user.id,
    restaurantId: tenant.restaurant.id,
    method: 'soporte',
    headers: headersList,
  });

  redirect(safeDestination(formData.get('destino')));
}

/** Devuelve el pase. El Super Admin vuelve a /super sin sesión en el panel ajeno. */
export async function revokeSupportAccess(): Promise<void> {
  const store = await cookies();
  store.set(SUPPORT_COOKIE, '', { ...supportCookieOptions(), maxAge: 0 });
  redirect('/super/restaurantes');
}

/**
 * Ruta interna a la que volver tras confirmar. Solo se acepta una ruta del
 * propio sitio: `//evil.com` es una URL absoluta para el navegador, así que
 * dejar pasar cualquier cosa que empiece con `/` convierte esta pantalla en
 * un redirector abierto.
 */
function safeDestination(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith('/') || value.startsWith('//')) return '/admin/menu';
  return value;
}
