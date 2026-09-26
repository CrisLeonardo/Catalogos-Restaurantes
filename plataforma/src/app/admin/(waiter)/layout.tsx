import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import { PLANS, type PlanCode } from '@/lib/plans';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import { decideTenantAccess } from '@/lib/auth/tenant-guard';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { adminUrl, authPathFor } from '@/lib/tenant';
import AdminShell from '@/components/admin/shell';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import type { Metadata } from 'next';
import { panelLink } from '@/lib/panel-links-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Panel de Mesero' };
}

export default async function WaiterLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  // Se adelanta antes de comprobar sesión/perfil: sin esto, quien llega sin
  // sesión (o con sesión pero sin perfil) a `/panel/<slug>/mesero` se
  // devolvía a un login genérico sin el restaurante puesto — authPathFor().
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  const { data: { user } } = await getStaffUser();
  if (!user) redirect(authPathFor('/admin/login', tenantSlug));

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, organization_id, full_name, permissions')
    .eq('id', user.id)
    .single();

  if (!profile) redirect(authPathFor('/admin/login', tenantSlug));

  const cookieStore = await cookies();
  const opCookie = cookieStore.get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role as string, user.id)) {
    redirect(authPathFor('/admin/logout-operator', tenantSlug));
  }
  // Checklist 2026-08-25 §2 — ver (protected)/layout.tsx.
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, user.id)) {
    redirect(authPathFor('/admin/logout-operator', tenantSlug));
  }

  const tenantData = tenantSlug ? await getRestaurantBySlug(tenantSlug) : null;

  // Qué es esta persona EN ESTE restaurante (migración 113). Se resuelve
  // ANTES de comprobar el permiso 'mesero': quien es mesero en la sucursal B
  // pero cajero en su propio local A tiene que entrar aquí con lo de B.
  const effective = await resolveEffectiveRole(
    { role: profile.role as string, permissions: profile.permissions as string[] | null },
    tenantData?.restaurant.id ?? null,
  );
  if (!can(effective.role, effective.permissions, 'mesero')) redirect(authPathFor('/admin/login', tenantSlug));

  // ── Candado de tenant ──────────────────────────────────────────────
  // Misma regla que el resto del panel (lib/auth/tenant-guard.ts). Antes esta
  // comprobación estaba escrita a mano aquí y mandaba al menú PÚBLICO del
  // restaurante ajeno; ahora el mesero vuelve a SU panel, como en /admin.
  const own = profile.restaurant_id
    ? await db.from('restaurants').select('slug').eq('id', profile.restaurant_id).maybeSingle()
    : null;
  const access = decideTenantAccess({
    role: profile.role as string,
    isMember: effective.isMember,
    profileRestaurantId: profile.restaurant_id as string | null,
    profileOrganizationId: profile.organization_id as string | null,
    tenantSlug,
    tenant: tenantData
      ? { id: tenantData.restaurant.id, organizationId: tenantData.restaurant.organization_id ?? null }
      : null,
    ownSlug: (own?.data?.slug as string | null) ?? null,
    adminUrlFor: adminUrl,
  });
  if (!access.allow) redirect(access.redirectTo);

  // SUPER_ADMIN no tiene restaurant_id propio: lo resuelve el subdominio (que
  // el candado de arriba ya validó).
  const restaurantId = (profile.restaurant_id as string | null) ?? tenantData?.restaurant.id ?? null;
  if (!restaurantId) redirect(profile.role === 'SUPER_ADMIN' ? '/super/restaurantes' : '/admin/login');

  let restaurantName = 'Restaurante';
  let ordersEnabled = false;
  let logoUrl: string | null = null;
  // Fondo del MENÚ del restaurante — el sidebar pinta el logo sobre él (ver AdminShell.logoBg).
  let logoBg: string | null = null;
  let zone = '';
  let llamadaMeseroActive = false;

  let planActual: string | null = null;

  if (tenantData) {
    restaurantName = tenantData.restaurant.name;
    const mod = tenantData.restaurant.modules as ModulesMap;
    const modSettings = tenantData.restaurant.module_settings as ModuleSettings;
    ordersEnabled = mod?.['orders'] === true;
    llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';
    planActual = tenantData.restaurant.plan_actual ?? null;
  } else {
    const { data: r } = await db.from('restaurants').select('name, modules, module_settings, plan_actual').eq('id', restaurantId).single();
    restaurantName = (r?.name as string | null) ?? 'Restaurante';
    const mod = r?.modules as ModulesMap;
    const modSettings = r?.module_settings as ModuleSettings;
    ordersEnabled = mod?.['orders'] === true;
    llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');
    planActual = (r?.plan_actual as string | null) ?? null;
  }

  // El panel de mesero es exclusivo de Premium — no se vende a la carta. Un
  // restaurante BASICO/ESTANDAR no debe poder usarlo aunque conozca la URL.
  // SUPER_ADMIN sí entra (soporte/pruebas), el resto va al upsell de suscripción.
  const hasWaiterPanel = PLANS[(planActual ?? 'BASICO') as PlanCode]?.hasWaiterPanel ?? false;
  if (profile.role !== 'SUPER_ADMIN' && !hasWaiterPanel) {
    redirect(await panelLink('/admin/suscripcion'));
  }

  return (
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={restaurantId}
      ordersEnabled={ordersEnabled}
      llamadaMeseroActive={llamadaMeseroActive}
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
      {isOperatorSession && <OperatorHeartbeat profileId={user.id} />}
      <SessionHeartbeat />
      {children}
    </AdminShell>
  );
}
