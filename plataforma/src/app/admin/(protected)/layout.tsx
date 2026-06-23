import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
import { isMeseroOnly } from '@/lib/permissions';
import { isModuleActive } from '@/lib/modules';
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
  let zone = '';

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      restaurantName = tenantData?.restaurant.name ?? 'Panel admin';
      currentRestaurant = tenantData?.restaurant ?? null;
      logoUrl = tenantData?.resolved.config.logoUrl ?? null;
      zone = tenantData?.resolved.config.zone ?? '';
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
      zone = tenantData.resolved.config.zone ?? '';
    } else {
      restaurantName = ctx.restaurant?.name ?? 'Panel admin';
    }
  }

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

  return (
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={currentRestaurant?.id ?? null}
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
      logoUrl={logoUrl}
      zone={zone}
      role={profile.role}
      permissions={profile.permissions}
      canManageStaff={profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN'}
    >
      {children}
    </AdminShell>
  );
}
