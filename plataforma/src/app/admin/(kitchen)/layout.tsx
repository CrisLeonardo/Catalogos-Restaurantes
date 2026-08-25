import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import type { ModulesMap } from '@/lib/modules';
import { adminUrl } from '@/lib/tenant';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import { decideTenantAccess } from '@/lib/auth/tenant-guard';
import { resolveEffectiveRole } from '@/lib/db/membership';
import AdminShell from '@/components/admin/shell';
import OfflineSupport from '@/components/offline-support';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cocina (KDS)' };

/**
 * Layout de la pantalla de cocina (KDS). Usa el mismo AdminShell (sidebar +
 * topbar) que el resto del panel — entrar a Cocina se siente igual que
 * entrar a cualquier otra sección. Quien necesite el tablero a pantalla
 * completa lo activa desde el botón "Pantalla completa" del topbar (ver
 * shell.tsx), que sigue siendo la misma vista sin chrome de siempre.
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
    .select('id, role, permissions, restaurant_id, organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/admin/login');

  const cookieStore = await cookies();
  const opCookie = cookieStore.get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role as string, user.id)) {
    redirect('/admin/logout-operator');
  }
  // Checklist 2026-08-25 §2 — ver (protected)/layout.tsx.
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, user.id)) {
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

  // Qué es esta persona EN ESTE restaurante (migración 113) — mismo criterio
  // que el panel de mesero: el permiso se comprueba con lo que es AQUÍ.
  const effective = await resolveEffectiveRole(
    { role: profile.role as string, permissions: profile.permissions as string[] | null },
    tenant?.restaurant.id ?? null,
  );
  if (!can(effective.role, effective.permissions, 'cocina')) redirect('/admin/login');

  const access = decideTenantAccess({
    role: profile.role as string,
    isMember: effective.isMember,
    profileRestaurantId: profile.restaurant_id as string | null,
    profileOrganizationId: profile.organization_id as string | null,
    tenantSlug,
    tenant: tenant
      ? { id: tenant.restaurant.id, organizationId: tenant.restaurant.organization_id ?? null }
      : null,
    ownSlug: (own?.data?.slug as string | null) ?? null,
    adminUrlFor: adminUrl,
  });
  if (!access.allow) redirect(access.redirectTo);

  // SUPER_ADMIN no tiene restaurant_id propio: lo resuelve el subdominio (que
  // el candado de arriba ya validó).
  const restaurantId = (profile.restaurant_id as string | null) ?? tenant?.restaurant.id ?? null;
  if (!restaurantId) redirect(profile.role === 'SUPER_ADMIN' ? '/super/restaurantes' : '/admin/login');

  let restaurantName = 'Restaurante';
  let ordersEnabled = false;
  let logoUrl: string | null = null;
  let logoBg: string | null = null;
  let zone = '';
  let planActual: string | null = null;

  if (tenant) {
    restaurantName = tenant.restaurant.name;
    const mod = tenant.restaurant.modules as ModulesMap;
    ordersEnabled = mod?.['orders'] === true;
    logoUrl = tenant.resolved.config.logoUrl ?? null;
    logoBg = tenant.resolved.config.colorBg ?? null;
    zone = tenant.resolved.config.zone ?? '';
    planActual = tenant.restaurant.plan_actual ?? null;
  } else {
    const { data: r } = await db.from('restaurants').select('name, modules, plan_actual').eq('id', restaurantId).single();
    restaurantName = (r?.name as string | null) ?? 'Restaurante';
    const mod = r?.modules as ModulesMap;
    ordersEnabled = mod?.['orders'] === true;
    planActual = (r?.plan_actual as string | null) ?? null;
  }

  return (
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={restaurantId}
      ordersEnabled={ordersEnabled}
      planActual={planActual}
      logoUrl={logoUrl}
      logoBg={logoBg}
      zone={zone}
      role={profile.role}
      permissions={profile.permissions}
      userName={profile.full_name}
      canManageStaff={
        effective.memberRole === 'MANAGER'
        || profile.role === 'RESTAURANT_OWNER'
        || profile.role === 'SUPER_ADMIN'
      }
      isOperatorSession={isOperatorSession}
    >
      <OfflineSupport />
      {isOperatorSession && <OperatorHeartbeat profileId={user.id} />}
      <SessionHeartbeat />
      {children}
    </AdminShell>
  );
}
