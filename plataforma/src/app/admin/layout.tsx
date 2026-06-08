import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminNav from '@/components/admin/nav';
import type { Restaurant } from '@/types';

export default async function AdminLayout({
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
  if (!user) redirect('/login');

  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');

  const { profile } = ctx;
  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  let restaurantName = 'Panel admin';
  let currentRestaurant: Restaurant | null = ctx.restaurant;

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      restaurantName = tenantData?.restaurant.name ?? 'Panel admin';
      currentRestaurant = tenantData?.restaurant ?? null;
    }
  } else {
    if (!profile.restaurant_id) redirect('/login');

    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      if (!tenantData || tenantData.restaurant.id !== profile.restaurant_id) {
        redirect('/');
      }
      restaurantName    = tenantData.restaurant.name;
      currentRestaurant = tenantData.restaurant;
    } else {
      restaurantName = ctx.restaurant?.name ?? 'Panel admin';
    }
  }

  const modules = currentRestaurant?.modules as { orders?: boolean } | null;
  const ordersEnabled = modules?.orders === true;

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <AdminNav restaurantName={restaurantName} ordersEnabled={ordersEnabled} />
      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}
