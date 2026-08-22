import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, type PlanCode } from '@/lib/plans';
import CatalogPanel from '@/components/admin/catalog-panel';
import ProductosExportButton from '@/components/admin/productos-export-button';

export const metadata = { title: 'Catálogo – Panel admin' };

export default async function AdminMenuPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  // getAdminMenu y la fila de módulos solo dependen de restaurantId, no una
  // de la otra — se lanzan juntas en vez de esperarlas en serie.
  const db = createServiceClient();
  const [{ categories, products }, { data: rest }] = await Promise.all([
    getAdminMenu(restaurantId),
    db
      .from('restaurants')
      .select('plan_actual')
      .eq('id', restaurantId)
      .single(),
  ]);

  const maxProducts = rest?.plan_actual ? PLANS[rest.plan_actual as PlanCode]?.maxProducts : undefined;

  return (
    <div className="anim-fade-up">
      {products.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <ProductosExportButton restaurantId={restaurantId} />
        </div>
      )}
      <CatalogPanel
        restaurantId={restaurantId}
        categories={categories}
        products={products}
        maxProducts={maxProducts}
      />
    </div>
  );
}
