import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminShell from '@/components/admin/shell';
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

  const modules = currentRestaurant?.modules as { orders?: boolean } | null;
  const ordersEnabled = modules?.orders === true;

  return (
    <AdminShell
      restaurantName={restaurantName}
      restaurantId={currentRestaurant?.id ?? null}
      ordersEnabled={ordersEnabled}
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
