import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { listGiftCards } from '@/lib/actions/gift-cards';
import { can } from '@/lib/permissions';
import GiftCardsPanel from '@/components/admin/gift-cards-panel';

export const metadata = { title: 'Tarjetas de regalo – Panel admin' };

export default async function AdminValesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'vales')) redirect('/admin/menu');

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

  const giftCards = await listGiftCards(restaurantId);

  return (
    <div className="anim-fade-up">
      {!ordersEnabled && (
        <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, marginBottom: 14 }}>
          Puedes emitir vales aunque no uses pedidos en línea, pero para <strong>aplicarlos</strong> a una compra
          necesitas el módulo <strong>Pedidos</strong> activo (el vale se descuenta de un pedido real).
        </div>
      )}
      <GiftCardsPanel restaurantId={restaurantId} giftCards={giftCards} />
    </div>
  );
}
