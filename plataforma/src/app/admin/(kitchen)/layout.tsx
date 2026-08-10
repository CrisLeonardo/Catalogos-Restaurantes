import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { adminUrl } from '@/lib/tenant';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { readSupportTicket, SUPPORT_COOKIE } from '@/lib/auth/support-session';
import { decideTenantAccess } from '@/lib/auth/tenant-guard';
import OfflineSupport from '@/components/offline-support';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cocina (KDS)' };

/**
 * Layout full-screen para la pantalla de cocina (KDS). A propósito NO usa
 * AdminShell: es una pantalla táctil dedicada para el cocinero, sin sidebar
 * ni chrome del panel. Solo verifica sesión + permiso "cocina".
 */
export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, permissions, restaurant_id, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile || !can(profile.role as string, profile.permissions as string[] | null, 'cocina')) {
    redirect('/admin/login');
  }

  const cookieStore = await cookies();
  const opCookie = cookieStore.get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role as string, user.id)) {
    redirect('/admin/logout-operator');
  }

  // ── Candado de tenant ──────────────────────────────────────────────
  // El KDS no tenía ninguno: con la cookie del personal (que vale en todo el
  // dominio) se abría en el subdominio de CUALQUIER restaurante y pintaba el
  // nombre de ese otro restaurante en la pantalla de cocina. Los pedidos sí
  // eran los propios —cocina/page.tsx filtra por profile.restaurant_id— pero
  // el panel no tiene por qué abrir donde no le toca. Verificado en local el
  // 2026-08-08: GET /admin/cocina en el subdominio ajeno respondía 200.
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');
  const tenant = tenantSlug ? await getRestaurantBySlug(tenantSlug) : null;
  const own = profile.restaurant_id
    ? await db.from('restaurants').select('slug').eq('id', profile.restaurant_id).maybeSingle()
    : null;

  const access = decideTenantAccess({
    role: profile.role as string,
    profileRestaurantId: profile.restaurant_id as string | null,
    profileOrganizationId: profile.organization_id as string | null,
    tenantSlug,
    tenant: tenant
      ? { id: tenant.restaurant.id, organizationId: tenant.restaurant.organization_id ?? null }
      : null,
    ownSlug: (own?.data?.slug as string | null) ?? null,
    supportTicketRestaurantId: readSupportTicket(cookieStore.get(SUPPORT_COOKIE)?.value),
    pathname: headersList.get('x-pathname') ?? '/admin/cocina',
    adminUrlFor: adminUrl,
  });
  if (!access.allow) redirect(access.redirectTo);

  return (
    <>
      <OfflineSupport />
      {isOperatorSession && <OperatorHeartbeat profileId={user.id} />}
      {children}
    </>
  );
}
