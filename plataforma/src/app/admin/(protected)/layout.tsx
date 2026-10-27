import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/supabase/server';
import { getAdminContext, myOrganizationId } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
import { PlanPricingProvider } from '@/components/plan-pricing-context';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import GroupOwnerBanner from '@/components/admin/group-owner-banner';
import VerifyEmailBanner from '@/components/admin/verify-email-banner';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import { can, isMeseroOnly } from '@/lib/permissions';
import { seccionDeRuta } from '@/lib/admin-nav';
import { internalPanelPath } from '@/lib/panel-links';
import { isModuleActive } from '@/lib/modules';
import { withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { adminUrl, authPathFor } from '@/lib/tenant';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import { CAMBIO_OBLIGATORIO, debeCambiarContrasena } from '@/lib/auth/password-change-rules';
import { decideTenantAccess } from '@/lib/auth/tenant-guard';
import { getMyMemberships } from '@/lib/db/membership';
import { emailEnabled } from '@/lib/email';
import type { Restaurant } from '@/types';
import { panelLink } from '@/lib/panel-links-server';
import { whatsappVisiblePara } from '@/lib/whatsapp/visible';

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

  // Se lee ANTES de comprobar la sesión: sin esto, a alguien sin sesión (o con
  // el candado de tenant vencido) que entra a `/panel/<slug>/menu` se le
  // devolvía a un login genérico sin el restaurante puesto — ver authPathFor().
  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  const { data: { user } } = await getStaffUser();
  if (!user) redirect(authPathFor('/admin/login', tenantSlug));
  // ACC-05: contraseña que eligió otro (el dueño, o Leogin en un rescate) →
  // primero la cambia por una suya.
  if (debeCambiarContrasena(user)) redirect(CAMBIO_OBLIGATORIO);

  // ctx (perfil/permite) y tenantData (datos del restaurante del subdominio)
  // son consultas independientes — tenantSlug sale de headers, no de ctx.
  // Antes se esperaban en serie (2 round-trips a Supabase uno tras otro);
  // se lanzan juntas para que corran en paralelo.
  const [ctx, tenantData] = await Promise.all([
    getAdminContext(),
    tenantSlug ? getRestaurantBySlug(tenantSlug) : Promise.resolve(null),
  ]);
  if (!ctx) redirect(authPathFor('/admin/login', tenantSlug));

  const { profile } = ctx;

  // El "mesero puro" (solo sección mesero) no entra al panel admin.
  if (isMeseroOnly(profile.role, profile.permissions)) {
    redirect(await panelLink('/admin/mesero'));
  }

  const cookieStore = await cookies();
  const opCookie = cookieStore.get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role, ctx.userId)) {
    redirect(authPathFor('/admin/logout-operator', tenantSlug));
  }
  // Checklist 2026-08-25 §2: la sesión de correo/Google (dueño, super admin,
  // o staff que entró por ahí en vez de PIN) también vence a los 30 min sin
  // actividad — antes no tenía ningún límite.
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, ctx.userId)) {
    redirect(authPathFor('/admin/logout-operator', tenantSlug));
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

  // ── Candado de SECCIÓN (SEC-06) ────────────────────────────────────
  // Los permisos por sección solo escondían enlaces: un mesero que tecleaba
  // /panel/<slug>/finanzas entraba igual. La sección que exige la ruta sale
  // del mismo menú (seccionDeRuta), así se bloquea justo lo que el menú
  // esconde. 'personal' no es delegable: la decide el rol, como en el menú.
  // Sin sección (Hoy, portada de Ajustes, Ayuda) no hay nada que comprobar.
  const seccion = seccionDeRuta(internalPanelPath(headersList.get('x-pathname')));
  const puedePersonal = ctx.memberRole === 'MANAGER'
    || profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN';
  if (seccion && (seccion === 'personal' ? !puedePersonal : !can(profile.role, profile.permissions, seccion))) {
    redirect(await panelLink('/admin'));
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
  let deliveryEnabled = false;

  // A partir de aquí solo se arma lo que se PINTA: el candado de arriba ya
  // decidió que esta sesión puede estar en este subdominio.
  if (tenantSlug && tenantData) {
    restaurantName    = tenantData.restaurant.name;
    currentRestaurant = tenantData.restaurant;
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';
    dineInEnabled = tenantData.resolved.config.orderTypes.includes('dine_in');
    deliveryEnabled = tenantData.resolved.config.orderTypes.includes('delivery');
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

  // El aviso «Tu local no tiene PC principal» ya NO se pinta aquí, en todas
  // las pantallas: ocupaba un cuarto del teléfono en Hoy, Pedidos, Menú… y
  // salía también a quien no tiene pedidos (Básico), que no imprime nada.
  // Vive en «Necesita tu atención» de Hoy y en la lista de primeros pasos
  // (auditoría de experiencia 2026-10-27, EV-14: una voz por vez).

  // El tour de bienvenida espera mientras esté la lista de primeros pasos:
  // abrirlo encima de ella eran dos guías hablando a la vez (EV-14).
  const tourEnEspera =
    profile.role === 'RESTAURANT_OWNER' && currentRestaurant?.onboarding_done === false;

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
  const [pricing, memberships] = await Promise.all([
    getEffectivePlanPricing(),
    getMyMemberships(),
  ]);

  return (
    <PlanPricingProvider pricing={pricing}>
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={currentRestaurant?.id ?? null}
      planActual={planActual}
      dineInEnabled={dineInEnabled}
      deliveryEnabled={deliveryEnabled}
      whatsappReady={whatsappVisiblePara(profile.role)}
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
      hasMultipleRestaurants={memberships.length > 1}
      tourEnEspera={tourEnEspera}
      isOperatorSession={isOperatorSession}
    >
      {needsEmailVerification && <VerifyEmailBanner email={user.email ?? null} />}
      {groupReturnUrl && (
        <GroupOwnerBanner branchName={restaurantName} returnUrl={groupReturnUrl} />
      )}
      {isOperatorSession && <OperatorHeartbeat profileId={ctx.userId} />}
      <SessionHeartbeat />
      {children}
    </AdminShell>
    </PlanPricingProvider>
  );
}
