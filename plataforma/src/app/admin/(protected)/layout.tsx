import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
import PlanGmvAlert from '@/components/admin/plan-gmv-alert';
import GroupOwnerBanner from '@/components/admin/group-owner-banner';
import { isMeseroOnly } from '@/lib/permissions';
import { isModuleActive } from '@/lib/modules';
import { subdomainUrl } from '@/lib/tenant';
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

  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const { profile } = ctx;

  // El "mesero puro" (solo sección mesero) no entra al panel admin.
  if (isMeseroOnly(profile.role, profile.permissions)) {
    redirect('/admin/mesero');
  }

  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

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

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      restaurantName = tenantData?.restaurant.name ?? 'Panel admin';
      currentRestaurant = tenantData?.restaurant ?? null;
      logoUrl = tenantData?.resolved.config.logoUrl ?? null;
      logoBg = tenantData?.resolved.config.colorBg ?? null;
      zone = tenantData?.resolved.config.zone ?? '';
    }
  } else if (profile.role === 'GROUP_OWNER') {
    // El dueño de grupo entra al admin de una sucursal de su organización sin
    // re-login. getRestaurantBySlug usa el cliente RLS: la migración 053 solo
    // devuelve la sucursal si pertenece a su grupo (candado de seguridad).
    if (!tenantSlug) redirect('/central');
    const tenantData = await getRestaurantBySlug(tenantSlug);
    if (!tenantData) redirect('/central'); // no es una sucursal de su grupo
    restaurantName    = tenantData.restaurant.name;
    currentRestaurant = tenantData.restaurant;
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';

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
      const tenantData = await getRestaurantBySlug(tenantSlug);
      if (!tenantData || tenantData.restaurant.id !== profile.restaurant_id) {
        redirect('/');
      }
      restaurantName    = tenantData.restaurant.name;
      currentRestaurant = tenantData.restaurant;
      logoUrl = tenantData.resolved.config.logoUrl ?? null;
      logoBg = tenantData.resolved.config.colorBg ?? null;
      zone = tenantData.resolved.config.zone ?? '';
    } else {
      restaurantName = ctx.restaurant?.name ?? 'Panel admin';
    }
  }

  const planActual = (currentRestaurant?.plan_actual as string | null) ?? null;
  const showGmvAlert = !!currentRestaurant?.id && planActual !== null && !['BASICO', 'VARIABLE'].includes(planActual);

  const mod = currentRestaurant?.modules as Record<string, boolean> | null;
  const m = (k: string) => mod?.[k] === true;

  // Módulos activables: activos solo si Leogin los habilitó Y el restaurante los prendió.
  const modSettings = currentRestaurant?.module_settings ?? null;
  const felActive = isModuleActive(mod, modSettings, 'fel');
  const proveedoresActive = isModuleActive(mod, modSettings, 'proveedores');
  const loyaltyActive = isModuleActive(mod, modSettings, 'loyalty');
  const reservacionesActive = isModuleActive(mod, modSettings, 'reservaciones');
  const encuestasActive = isModuleActive(mod, modSettings, 'encuestas');
  const cuponesActive = isModuleActive(mod, modSettings, 'cupones');
  const recetasActive = isModuleActive(mod, modSettings, 'recetas');
  const llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');

  return (
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={currentRestaurant?.id ?? null}
      planActual={planActual}
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
      encuestasActive={encuestasActive}
      cuponesActive={cuponesActive}
      llamadaMeseroActive={llamadaMeseroActive}
      logoUrl={logoUrl}
      logoBg={logoBg}
      zone={zone}
      role={profile.role}
      permissions={profile.permissions}
      canManageStaff={profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN'}
    >
      {groupReturnUrl && (
        <GroupOwnerBanner branchName={restaurantName} returnUrl={groupReturnUrl} />
      )}
      {showGmvAlert && (
        <PlanGmvAlert restaurantId={currentRestaurant!.id} />
      )}
      {children}
    </AdminShell>
  );
}
