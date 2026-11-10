import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import InventoryPanel, { type IngredienteAgotado } from '@/components/admin/inventory-panel';
import { createServiceClient } from '@/lib/supabase/service';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Inventario – Panel admin' };

/* ============================================================
   /admin/inventario — control de existencias (auditoría 1.10)
   Cobertura, «por revisar hoy», activación en lote y ajustes con
   motivo. Las existencias bajan solas al vender y vuelven al
   cancelar; los ingredientes que «se acabaron» salen aquí también.
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

  const db = createServiceClient();
  const [{ categories, products }, { data: rest }, { data: ingAgotados }] = await Promise.all([
    getAdminMenu(restaurantId),
    db.from('restaurants').select('timezone').eq('id', restaurantId).maybeSingle(),
    db.from('ingredients').select('id, name').eq('restaurant_id', restaurantId).not('agotado_at', 'is', null).order('name'),
  ]);

  /* Cuántos platillos tiene fuera cada ingrediente que se acabó. */
  let ingredientesAgotados: IngredienteAgotado[] = [];
  if (ingAgotados && ingAgotados.length > 0) {
    const fuera = new Set(products.filter((p) => p.agotado_motivo === 'ingrediente').map((p) => p.id));
    const { data: usos } = await db.from('recipe_items').select('ingredient_id, product_id').in('ingredient_id', ingAgotados.map((i) => i.id));
    ingredientesAgotados = ingAgotados.map((i) => ({
      id: i.id as string,
      name: i.name as string,
      platillos: new Set((usos ?? []).filter((u) => u.ingredient_id === i.id && fuera.has(u.product_id as string)).map((u) => u.product_id)).size,
    }));
  }

  return (
    <div className="anim-fade-up">
      <InventoryPanel restaurantId={restaurantId} categories={categories} products={products}
        ingredientesAgotados={ingredientesAgotados} timezone={(rest?.timezone as string | null) ?? undefined} />
    </div>
  );
}
