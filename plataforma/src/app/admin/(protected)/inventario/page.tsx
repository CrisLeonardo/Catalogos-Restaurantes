import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import InventoryPanel from '@/components/admin/inventory-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Inventario – Panel admin' };

/* ============================================================
   /admin/inventario — control de existencias
   El restaurante decide qué productos controlar; el stock baja
   solo al vender y se devuelve al cancelar. Alertas de stock
   bajo / agotado.
   ============================================================ */

export default async function AdminInventarioPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'inventario')) redirect(await panelLink('/admin'));

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

  const { categories, products } = await getAdminMenu(restaurantId);

  return (
    <div className="anim-fade-up">
      <InventoryPanel restaurantId={restaurantId} categories={categories} products={products} />
    </div>
  );
}
