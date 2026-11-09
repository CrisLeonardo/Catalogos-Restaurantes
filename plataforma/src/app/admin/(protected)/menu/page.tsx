import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, type PlanCode } from '@/lib/plans';
import CatalogPanel from '@/components/admin/catalog-panel';
import ProductosExportButton from '@/components/admin/productos-export-button';
import { withEffectiveAvailability } from '@/lib/product-availability';

export const metadata = { title: 'Catálogo – Panel admin' };

export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; cat?: string; f?: string; orden?: string }>;
}) {
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

  /* Lo agotado ya no son tarjetas arriba de la lista: la propia lista lo
     dice en una línea y lo filtra (auditoría 1.9, R06.1). */
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const sp = await searchParams;

  return (
    <div className="anim-fade-up flex flex-col gap-4">
      {/* La lista recibe la disponibilidad YA resuelta con la regla del menú:
          antes pintaba la columna cruda y enseñaba «Agotado» en platillos que
          el comensal estaba pidiendo (auditoría 2026-10-02, CAT-01). */}
      <CatalogPanel
        exportSlot={<ProductosExportButton restaurantId={restaurantId} />}
        inicial={sp}
        restaurantId={restaurantId}
        categories={categories}
        products={withEffectiveAvailability(products, ahora)}
        maxProducts={maxProducts}
      />
    </div>
  );
}
