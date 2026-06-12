import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import CategoriesPanel from '@/components/admin/categories-panel';

export const metadata = { title: 'Categorías – Panel admin' };

export default async function AdminCategoriasPage() {
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

  const { categories, products } = await getAdminMenu(restaurantId);

  return (
    <div className="anim-fade-up">
      <CategoriesPanel
        restaurantId={restaurantId}
        categories={categories}
        products={products}
      />
    </div>
  );
}
