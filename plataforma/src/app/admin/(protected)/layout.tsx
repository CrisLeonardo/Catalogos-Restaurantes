import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
import { PlanPricingProvider } from '@/components/plan-pricing-context';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import GroupOwnerBanner from '@/components/admin/group-owner-banner';
import DesktopServerNudge from '@/components/admin/desktop-server-nudge';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import { isMeseroOnly } from '@/lib/permissions';
import { isModuleActive } from '@/lib/modules';
import { adminUrl, subdomainUrl } from '@/lib/tenant';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
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

  const opCookie = (await cookies()).get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role, ctx.userId)) {
    redirect('/admin/logout-operator');
  }

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

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      restaurantName = tenantData?.restaurant.name ?? 'Panel admin';
      currentRestaurant = tenantData?.restaurant ?? null;
      logoUrl = tenantData?.resolved.config.logoUrl ?? null;
      logoBg = tenantData?.resolved.config.colorBg ?? null;
      zone = tenantData?.resolved.config.zone ?? '';
      dineInEnabled = tenantData?.resolved.config.orderTypes.includes('dine_in') ?? false;
    }
  } else if (profile.role === 'GROUP_OWNER') {
    // El dueño de grupo entra al admin de una sucursal de su organización sin
    // re-login. getRestaurantBySlug usa el cliente RLS: la migración 053 solo
    // devuelve la sucursal si pertenece a su grupo (candado de seguridad).
    if (!tenantSlug) redirect('/central');
    if (!tenantData) redirect('/central'); // no es una sucursal de su grupo
    restaurantName    = tenantData.restaurant.name;
    currentRestaurant = tenantData.restaurant;
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';
    dineInEnabled = tenantData.resolved.config.orderTypes.includes('dine_in');

    // Slug del grupo para el enlace "volver al grupo" (organizations no tiene
    // RLS para GROUP_OWNER → se lee con el cliente de servicio).
    if (tenantData.restaurant.organization_id) {
      const svc = createServiceClient();
      const { data: org } = await svc
        .from('organizations')
        .select('slug')
        .eq('id', tenantData.restaurant.organization_id)
        .maybeSingle();
      if (org?.slug) groupReturnUrl = subdomainUrl(`${org.slug}-central`);
    }
  } else {
    if (!profile.restaurant_id) redirect('/admin/login');

    if (tenantSlug) {
      if (!tenantData || tenantData.restaurant.id !== profile.restaurant_id) {
        // Sesión válida pero en el subdominio de OTRO restaurante (típico en
        // Leogin Desktop tras cambiar de cuenta, o en una pestaña vieja):
        // mandarlo a SU panel, no al menú público del restaurante equivocado
        // — eso se leía como "tu cuenta no existe" cuando la cuenta estaba
        // perfectamente bien.
        if (ctx.restaurant?.slug) {
          redirect(`${adminUrl(ctx.restaurant.slug)}/menu`);
        }
        redirect('/');
      }
      restaurantName    = tenantData.restaurant.name;
      currentRestaurant = tenantData.restaurant;
      logoUrl = tenantData.resolved.config.logoUrl ?? null;
      logoBg = tenantData.resolved.config.colorBg ?? null;
      zone = tenantData.resolved.config.zone ?? '';
      dineInEnabled = tenantData.resolved.config.orderTypes.includes('dine_in');
    } else {
      restaurantName = ctx.restaurant?.name ?? 'Panel admin';
    }
  }

  const planActual = (currentRestaurant?.plan_actual as string | null) ?? null;

  // ¿El restaurante ya tiene su PC servidor (agente/modo local vinculado)?
  // Solo la nube lo sabe con certeza — ve TODO el local, no solo esta PC.
  // Si NO lo tiene, el dueño verá (únicamente dentro de Leogin Desktop, el
  // componente cliente comprueba window.__TAURI__) la invitación a activar
  // esta PC como servidor del local. Dueños solamente: el personal no debe
  // decidir la infraestructura del restaurante.
  let offerLocalServer = false;
  if (
    currentRestaurant?.id &&
    (profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN')
  ) {
    const svc = createServiceClient();
    const { data: agentRow } = await svc
      .from('print_agents')
      .select('id')
      .eq('restaurant_id', currentRestaurant.id)
      .maybeSingle();
    offerLocalServer = !agentRow;
  }

  const mod = currentRestaurant?.modules as Record<string, boolean> | null;
  const m = (k: string) => mod?.[k] === true;

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
      promocionesEnabled={m('promociones')}
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
      canManageStaff={profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN'}
      isOperatorSession={isOperatorSession}
    >
      {groupReturnUrl && (
        <GroupOwnerBanner branchName={restaurantName} returnUrl={groupReturnUrl} />
      )}
      {offerLocalServer && <DesktopServerNudge />}
      {isOperatorSession && <OperatorHeartbeat profileId={ctx.userId} />}
      {children}
    </AdminShell>
    </PlanPricingProvider>
  );
}
