import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getRestaurantOrders, getOrderStats } from '@/lib/db/orders';
import OrdersPanel from '@/components/admin/orders-panel';

export default async function PedidosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');

  const { profile } = ctx;
  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  let restaurantId: string | null = null;

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const td = await getRestaurantBySlug(tenantSlug);
      restaurantId = td?.restaurant.id ?? null;
    }
  } else {
    restaurantId = profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/menu');

  const [orders, stats] = await Promise.all([
    getRestaurantOrders(restaurantId),
    getOrderStats(restaurantId),
  ]);

  return <OrdersPanel initialOrders={orders} restaurantId={restaurantId} stats={stats} />;
}
