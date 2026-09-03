import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { resolveModuleContext } from '@/lib/modules-server';
import { getIngredients, getIngredientUsageCounts } from '@/lib/db/recipes';
import IngredientPanel from '@/components/admin/ingredient-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Ingredientes – Panel admin' };

export default async function AdminIngredientesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'ingredientes')) redirect(await panelLink('/admin'));

  // El módulo de recetas debe estar ACTIVO (entitlement + on del restaurante),
  // igual que el resto de módulos — no basta con tener el permiso.
  const mod = await resolveModuleContext('recetas');
  if (!mod.ok) redirect(await panelLink('/admin'));
  const restaurantId = mod.restaurantId;

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
