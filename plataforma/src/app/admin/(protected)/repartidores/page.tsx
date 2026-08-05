import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { getDrivers } from '@/lib/db/drivers';
import DriversPanel from '@/components/admin/drivers-panel';

export const metadata = { title: 'Repartidores – Panel admin' };

/* ============================================================
   /admin/repartidores — alta de repartidores (Fase 2)
   ------------------------------------------------------------
   La asignación de cada pedido se hace desde /admin/pedidos; aquí solo se
   administra quién existe.
   ============================================================ */

export default async function AdminRepartidoresPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'repartidores')) redirect('/admin/menu');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const [drivers, { data: staffRows }] = await Promise.all([
    getDrivers(restaurantId),
    db
      .from('profiles')
      .select('id, full_name')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'RESTAURANT_STAFF'),
  ]);

  return (
    <div className="anim-fade-up">
      <DriversPanel
        restaurantId={restaurantId}
        drivers={drivers}
        staff={(staffRows ?? []) as { id: string; full_name: string | null }[]}
      />
    </div>
  );
}
