import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import AdminShell from '@/components/admin/shell';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Panel de Mesero' };
}

export default async function WaiterLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, full_name, permissions')
    .eq('id', user.id)
    .single();

  if (!profile || !can(profile.role as string, profile.permissions as string[] | null, 'mesero')) {
    redirect('/admin/login');
  }

  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // SUPER_ADMIN no tiene restaurant_id propio: lo resolvemos del slug de tenant.
  let restaurantId = profile.restaurant_id as string | null;
  if (!restaurantId && profile.role === 'SUPER_ADMIN') {
    if (!tenantSlug) redirect('/super/restaurantes');
    const tenantData = await getRestaurantBySlug(tenantSlug);
    if (!tenantData) redirect('/super/restaurantes');
    restaurantId = tenantData.restaurant.id;
  }
  if (!restaurantId) redirect('/admin/login');

  let restaurantName = 'Restaurante';
  let ordersEnabled = false;
  let logoUrl: string | null = null;
  // Fondo del MENÚ del restaurante — el sidebar pinta el logo sobre él (ver AdminShell.logoBg).
  let logoBg: string | null = null;
  let zone = '';
  let llamadaMeseroActive = false;

  if (tenantSlug) {
    const tenantData = await getRestaurantBySlug(tenantSlug);
    if (!tenantData || tenantData.restaurant.id !== restaurantId) redirect('/');
    restaurantName = tenantData.restaurant.name;
    const mod = tenantData.restaurant.modules as ModulesMap;
    const modSettings = tenantData.restaurant.module_settings as ModuleSettings;
    ordersEnabled = mod?.['orders'] === true;
    llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');
    logoUrl = tenantData.resolved.config.logoUrl ?? null;
    logoBg = tenantData.resolved.config.colorBg ?? null;
    zone = tenantData.resolved.config.zone ?? '';
  } else {
    const { data: r } = await db.from('restaurants').select('name, modules, module_settings').eq('id', restaurantId).single();
    restaurantName = (r?.name as string | null) ?? 'Restaurante';
    const mod = r?.modules as ModulesMap;
    const modSettings = r?.module_settings as ModuleSettings;
    ordersEnabled = mod?.['orders'] === true;
    llamadaMeseroActive = isModuleActive(mod, modSettings, 'llamada_mesero');
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
      canManageStaff={profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN'}
    >
      {children}
    </AdminShell>
  );
}
