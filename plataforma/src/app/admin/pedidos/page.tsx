import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getRestaurantOrders } from '@/lib/db/orders';
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

  const orders = await getRestaurantOrders(restaurantId);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)' }}>
          Pedidos
        </h1>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: 11, fontWeight: 700,
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--u-text-3)',
            border: '1px solid var(--u-hair)',
          }}
        >
          Tiempo real
        </span>
      </div>

      <OrdersPanel
        initialOrders={orders}
        restaurantId={restaurantId}
      />
    </>
  );
}
