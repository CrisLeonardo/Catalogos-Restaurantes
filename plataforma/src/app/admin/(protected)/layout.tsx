import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext, myOrganizationId } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
import { PlanPricingProvider } from '@/components/plan-pricing-context';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import GroupOwnerBanner from '@/components/admin/group-owner-banner';
import VerifyEmailBanner from '@/components/admin/verify-email-banner';
import MainPcBanner from '@/components/admin/main-pc-banner';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import { isMeseroOnly } from '@/lib/permissions';
import { isModuleActive } from '@/lib/modules';
import { withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { adminUrl } from '@/lib/tenant';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import { decideTenantAccess } from '@/lib/auth/tenant-guard';
import { getMyMemberships } from '@/lib/db/membership';
import { emailEnabled } from '@/lib/email';
import type { Restaurant } from '@/types';

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  // ctx (perfil/permite) y tenantData (datos del restaurante del subdominio)
  // son consultas independientes — tenantSlug sale de headers, no de ctx.
  // Antes se esperaban en serie (2 round-trips a Supabase uno tras otro);
  // se lanzan juntas para que corran en paralelo.
  const [ctx, tenantData] = await Promise.all([
    getAdminContext(),
    tenantSlug ? getRestaurantBySlug(tenantSlug) : Promise.resolve(null),
  ]);
  if (!ctx) redirect('/admin/login');

  const { profile } = ctx;

  // El "mesero puro" (solo sección mesero) no entra al panel admin.
  if (isMeseroOnly(profile.role, profile.permissions)) {
    redirect('/admin/mesero');
  }

  const cookieStore = await cookies();
  const opCookie = cookieStore.get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role, ctx.userId)) {
    redirect('/admin/logout-operator');
  }
  // Checklist 2026-08-25 §2: la sesión de correo/Google (dueño, super admin,
  // o staff que entró por ahí en vez de PIN) también vence a los 30 min sin
  // actividad — antes no tenía ningún límite.
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, ctx.userId)) {
    redirect('/admin/logout-operator');
  }

  // ── Candado de tenant ──────────────────────────────────────────────
  // Estar autenticado no dice nada sobre a qué panel se tiene derecho: la
  // cookie del personal vale en todos los subdominios. La regla vive en
  // lib/auth/tenant-guard.ts, una sola, compartida con el panel de mesero y
  // con el KDS (que antes no tenía ninguna).
  const access = decideTenantAccess({
    role: profile.role,
    // getAdminContext ya resolvió la membresía en este subdominio (y con ella
    // el rol y los permisos de aquí). Se pasa explícito en vez de dejar que
    // el candado lo deduzca del restaurant_id reescrito en memoria: la regla
    // tiene que poder leerse sin conocer ese detalle.
    isMember: ctx.memberRole !== null,
    profileRestaurantId: profile.restaurant_id,
    profileOrganizationId: profile.organization_id,
    tenantSlug,
    tenant: tenantData
      ? { id: tenantData.restaurant.id, organizationId: tenantData.restaurant.organization_id ?? null }
      : null,
    ownSlug: ctx.restaurant?.slug ?? null,
    adminUrlFor: adminUrl,
  });
  if (!access.allow) redirect(access.redirectTo);

  let restaurantName = 'Panel admin';
  let currentRestaurant: Restaurant | null = ctx.restaurant;
  let logoUrl: string | null = null;
  // Fondo del MENÚ del restaurante: el logo se pinta sobre él en el sidebar
  // para que se vea igual que en el menú (un logo claro sobre panel claro
  // desaparecía).
  let logoBg: string | null = null;
  let zone = '';
  // URL del panel del grupo para volver (solo dueño de grupo "entrando" a una sucursal).
  let groupReturnUrl: string | null = null;
  // "Comer en local" activo → el restaurante depende de /admin/mesas para
  // configurar cantidad de mesas y preferencias, aunque su plan no incluya
  // el panel de mesero completo (ver mesas/page.tsx).
  let dineInEnabled = false;

  // A partir de aquí solo se arma lo que se PINTA: el candado de arriba ya
  // decidió que esta sesión puede estar en este subdominio.
  if (tenantSlug && tenantData) {
    restaurantName    = tenantData.restaurant.name;
    currentRestaurant = tenantData.restaurant;
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';
    dineInEnabled = tenantData.resolved.config.orderTypes.includes('dine_in');
  } else {
    // Sin subdominio de restaurante: quien tiene varios va a Mi cuenta a
    // elegir, el resto se queda con el suyo (Leogin Desktop arranca así).
    if (await myOrganizationId()) redirect('/mi-cuenta');
    if (profile.role !== 'SUPER_ADMIN' && !profile.restaurant_id) redirect('/admin/login');
    restaurantName = ctx.restaurant?.name ?? 'Panel admin';
  }

  // Enlace "ver el conjunto": quien tiene DOS O MÁS restaurantes propios,
  // estando dentro de uno. Antes esto dependía de que existiera una fila en
  // `organizations` (que solo creaba Leogin) y apuntaba a otro subdominio;
  // hoy el consolidado es una sección de Mi cuenta y lo abre cualquiera que
  // tenga con qué compararlo.
  //
  // El enlace va RELATIVO a propósito: el proxy no reescribe /mi-cuenta bajo
  // el subdominio del panel, así que funciona igual en local y en producción
  // sin saltar a un host donde quizá no haya sesión.
  if (currentRestaurant
      && (await getMyMemberships()).filter((m) => m.role === 'OWNER').length > 1) {
    groupReturnUrl = '/mi-cuenta/resumen';
  }

  // Aviso de correo sin confirmar: solo al DUEÑO (el personal entra por PIN
  // con correos inventados) y solo si de verdad podemos mandar el correo —
  // un botón "reenviar" que no reenvía nada es peor que no tenerlo.
  const needsEmailVerification =
    profile.role === 'RESTAURANT_OWNER' && !profile.email_verified_at && emailEnabled();

  const planActual = (currentRestaurant?.plan_actual as string | null) ?? null;

  // ¿El restaurante tiene una PC principal encendida? Solo la nube lo sabe con
  // certeza — ve TODO el local, no solo el dispositivo desde el que se mira.
  // Si NO la tiene, el dueño ve el aviso en TODAS las pantallas del panel (no
  // solo dentro de Leogin Desktop, como antes: quien abría el panel desde el
  // navegador jamás se enteraba de que le faltaba). Dueños solamente: el
  // personal no decide la infraestructura del restaurante.
  let localServerState: 'missing' | 'off' | null = null;
  if (
    currentRestaurant?.id &&
    (profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN')
  ) {
    const svc = createServiceClient();
    const { data: agentRow } = await svc
      .from('print_agents')
      .select('id, is_active')
      .eq('restaurant_id', currentRestaurant.id)
      .maybeSingle();
    if (!agentRow) localServerState = 'missing';
    else if ((agentRow.is_active as boolean | null) === false) localServerState = 'off';
  }

  // El PLAN manda sobre restaurants.modules: si el plan lo incluye, se entrega,
  // aunque la bandera del jsonb se haya quedado atrás. La migración 095 ya
  // garantiza este piso en la base; aquí se vuelve a aplicar para que el panel
  // sea correcto aunque corra contra una base donde aún no se haya ejecutado.
  // Sin esto, una sección incluida en el plan con la bandera en false
  // desaparecía del nav por completo — lockableNavItem devuelve [], ni candado
  // ni acceso — y el cliente pagaba por algo que nunca veía.
  const mod = withPlanFloor(
    ((PLAN_ORDER as string[]).includes(planActual ?? '') ? planActual : 'BASICO') as PlanCode,
    (currentRestaurant?.modules as Record<string, boolean> | null) ?? {},
  );
  const m = (k: string) => mod[k] === true;

  // Módulos activables: activos solo si Leogin los habilitó Y el restaurante los prendió.
  const modSettings = currentRestaurant?.module_settings ?? null;
  const felActive = isModuleActive(mod, modSettings, 'fel');
  const proveedoresActive = isModuleActive(mod, modSettings, 'proveedores');
  const loyaltyActive = isModuleActive(mod, modSettings, 'loyalty');
  const reservacionesActive = isModuleActive(mod, modSettings, 'reservaciones');
  const listaEsperaActive = isModuleActive(mod, modSettings, 'lista_espera');
  const encuestasActive = isModuleActive(mod, modSettings, 'encuestas');
  const cuponesActive = isModuleActive(mod, modSettings, 'cupones');
  const recetasActive = isModuleActive(mod, modSettings, 'recetas');
  const llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');

  // Precios vigentes para los upsells del panel (candados de plan, módulos,
  // suscripción): reflejan lo que el super admin configuró, no el default.
  const pricing = await getEffectivePlanPricing();

  return (
    <PlanPricingProvider pricing={pricing}>
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={currentRestaurant?.id ?? null}
      planActual={planActual}
      dineInEnabled={dineInEnabled}
      ordersEnabled={m('orders')}
      analiticaEnabled={m('analitica')}
      inventarioEnabled={m('inventario')}
      ingredientesEnabled={recetasActive}
      personalEnabled={m('personal')}
      finanzasEnabled={m('finanzas')}
      felActive={felActive}
      proveedoresActive={proveedoresActive}
      loyaltyActive={loyaltyActive}
      reservacionesActive={reservacionesActive}
      listaEsperaActive={listaEsperaActive}
      encuestasActive={encuestasActive}
      cuponesActive={cuponesActive}
      llamadaMeseroActive={llamadaMeseroActive}
      logoUrl={logoUrl}
      logoBg={logoBg}
      zone={zone}
      role={profile.role}
      permissions={profile.permissions}
      userName={profile.full_name}
      canManageStaff={
        ctx.memberRole === 'MANAGER'
        || profile.role === 'RESTAURANT_OWNER'
        || profile.role === 'SUPER_ADMIN'
      }
      hasMultipleRestaurants={(await getMyMemberships()).length > 1}
      isOperatorSession={isOperatorSession}
    >
      {needsEmailVerification && <VerifyEmailBanner email={user.email ?? null} />}
      {groupReturnUrl && (
        <GroupOwnerBanner branchName={restaurantName} returnUrl={groupReturnUrl} />
      )}
      {localServerState && <MainPcBanner state={localServerState} />}
      {isOperatorSession && <OperatorHeartbeat profileId={ctx.userId} />}
      <SessionHeartbeat />
      {children}
    </AdminShell>
    </PlanPricingProvider>
  );
}
