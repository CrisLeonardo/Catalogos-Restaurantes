import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { getIngredients, getIngredientUsageCounts } from '@/lib/db/recipes';
import IngredientPanel from '@/components/admin/ingredient-panel';

export const metadata = { title: 'Ingredientes – Panel admin' };

export default async function AdminIngredientesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'ingredientes')) redirect('/admin/menu');

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

  const [ingredients, usageCounts] = await Promise.all([
    getIngredients(restaurantId),
    getIngredientUsageCounts(restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <IngredientPanel
        restaurantId={restaurantId}
        initialIngredients={ingredients}
        usageCounts={usageCounts}
      />
    </div>
  );
}
