import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { listPromotions } from '@/lib/db/promos';
import { can } from '@/lib/permissions';
import PromotionsPanel from '@/components/admin/promotions-panel';

export const metadata = { title: 'Promociones – Panel admin' };

export default async function AdminPromocionesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'promociones')) redirect('/admin/menu');

  let restaurantId: string | null = null;
  let ordersEnabled = false;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
      ordersEnabled = (t?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  const promotions = await listPromotions(restaurantId);

  return (
    <div className="anim-fade-up">
      {!ordersEnabled && (
        <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, marginBottom: 14 }}>
          Las promociones se aplican en los pedidos en línea. Actívalo (módulo <strong>Pedidos</strong>, plan Estándar) para que tus cupones funcionen en el checkout.
        </div>
      )}
      <PromotionsPanel restaurantId={restaurantId} promotions={promotions} />
    </div>
  );
}
