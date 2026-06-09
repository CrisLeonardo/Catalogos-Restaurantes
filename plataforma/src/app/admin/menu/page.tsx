import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import CatalogPanel from '@/components/admin/catalog-panel';

export const metadata = { title: 'Catálogo — Panel admin' };

export default async function AdminMenuPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');

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

  if (!restaurantId) redirect('/login');

  const { categories, products } = await getAdminMenu(restaurantId);

  return (
    <div className="anim-fade-up">
      <CatalogPanel
        restaurantId={restaurantId}
        categories={categories}
        products={products}
      />
    </div>
  );
}
