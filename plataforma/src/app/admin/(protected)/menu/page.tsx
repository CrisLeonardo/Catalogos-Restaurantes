import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import { getIngredients, type Ingredient } from '@/lib/db/recipes';
import CatalogPanel from '@/components/admin/catalog-panel';

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
      .select('modules, module_settings')
      .eq('id', restaurantId)
      .single(),
  ]);

  // Módulo de recetas: si está activo, traemos los insumos para que el editor
  // de platillo permita armar la receta y costear automáticamente.
  const recetasActive = isModuleActive(
    rest?.modules as ModulesMap,
    rest?.module_settings as ModuleSettings,
    'recetas',
  );
  const ingredients: Ingredient[] = recetasActive ? await getIngredients(restaurantId) : [];

  return (
    <div className="anim-fade-up">
      <CatalogPanel
        restaurantId={restaurantId}
        categories={categories}
        products={products}
        ingredients={ingredients}
        recetasActive={recetasActive}
      />
    </div>
  );
}
