'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { getProductRecipe, type RecipeItem } from '@/lib/db/recipes';
import { getIngredientMovements as fetchIngredientMovements, type StockMovement } from '@/lib/db/kardex';

export type ActionResult = { error?: string; ok?: boolean };
type Resolved = { restaurantId: string } | { error: string };

async function resolveRestaurantId(formRestaurantId?: string | null): Promise<Resolved> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Perfil no encontrado' };

  if (profile.role === 'SUPER_ADMIN') {
    if (!formRestaurantId) return { error: 'Falta restaurant_id' };
    return { restaurantId: formRestaurantId };
  }
  // Sucursal del grupo que administra, si administra alguno (migración 116).
  const groupBranchId = await resolveGroupBranchId();
  if (groupBranchId) return { restaurantId: groupBranchId };
  const own = await resolveOwnRestaurantId(profile.restaurant_id);
  if (!own) return { error: 'Sin restaurante' };
  return { restaurantId: own };
}

// ── Ingredientes ─────────────────────────────────────────────

export async function saveIngredient(formData: FormData): Promise<ActionResult> {
  const resolved = await resolveRestaurantId(formData.get('restaurantId') as string);
  if ('error' in resolved) return resolved;
  const { restaurantId } = resolved;

  const id   = formData.get('id') as string | null;
  const name = (formData.get('name') as string ?? '').trim();
  const unit = (formData.get('unit') as string ?? '').trim();
  const cost = parseFloat(formData.get('cost_per_unit') as string);

  if (!name) return { error: 'El nombre es requerido' };
  if (isNaN(cost) || cost < 0) return { error: 'Costo inválido' };

  const supabase = createServiceClient();

  if (id) {
    const { error } = await supabase
      .from('ingredients')
      .update({ name, unit, cost_per_unit: cost })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('ingredients')
      .insert({ restaurant_id: restaurantId, name, unit, cost_per_unit: cost });
    if (error) return { error: error.message };
  }

  revalidatePath('/admin/ingredientes');
  return { ok: true };
}

export async function deleteIngredient(id: string, formRestaurantId: string): Promise<ActionResult> {
  const resolved = await resolveRestaurantId(formRestaurantId);
  if ('error' in resolved) return resolved;
  const { restaurantId } = resolved;

  const supabase = createServiceClient();

  const { count } = await supabase
    .from('recipe_items')
    .select('id', { count: 'exact', head: true })
    .eq('ingredient_id', id);

  if ((count ?? 0) > 0) {
    return { error: `Este ingrediente se usa en ${count} receta(s). Elimínalo de las recetas primero.` };
  }

  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);

  if (error) return { error: error.message };
  revalidatePath('/admin/ingredientes');
  return { ok: true };
}

/** Historial de movimientos (Kardex) de un insumo — entradas por compra, cambios de costo promedio. */
export async function getIngredientMovements(
  ingredientId: string,
  formRestaurantId: string,
): Promise<{ movements?: StockMovement[]; error?: string }> {
  const resolved = await resolveRestaurantId(formRestaurantId);
  if ('error' in resolved) return { error: resolved.error };
  const { restaurantId } = resolved;

  if (!/^[0-9a-f-]{36}$/i.test(ingredientId)) return { error: 'Insumo inválido' };
  const movements = await fetchIngredientMovements(restaurantId, ingredientId);
  return { movements };
}

// ── Recetas ──────────────────────────────────────────────────

export type RecipeLineInput = { ingredient_id: string; quantity: number };

/**
 * Carga la receta de un producto (con auth). La usa el modal del catálogo para
 * traer la receta de forma perezosa al abrir el editor de un platillo existente.
 */
export async function getRecipeForProduct(
  productId: string,
  formRestaurantId: string,
): Promise<{ recipe?: RecipeItem[]; error?: string }> {
  const resolved = await resolveRestaurantId(formRestaurantId);
  if ('error' in resolved) return { error: resolved.error };
  const { restaurantId } = resolved;

  const supabase = createServiceClient();
  const { data: prod } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .single();
  if (!prod) return { error: 'Producto no encontrado' };

  const recipe = await getProductRecipe(productId);
  return { recipe };
}

export async function saveProductRecipe(
  productId: string,
  formRestaurantId: string,
  lines: RecipeLineInput[],
): Promise<ActionResult> {
  const resolved = await resolveRestaurantId(formRestaurantId);
  if ('error' in resolved) return resolved;
  const { restaurantId } = resolved;

  const supabase = createServiceClient();

  const { data: prod } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .single();
  if (!prod) return { error: 'Producto no encontrado' };

  await supabase.from('recipe_items').delete().eq('product_id', productId);

  if (lines.length > 0) {
    const { error } = await supabase.from('recipe_items').insert(
      lines.map((l) => ({
        product_id: productId,
        ingredient_id: l.ingredient_id,
        quantity: l.quantity,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath(`/admin/menu/productos/${productId}`);
  return { ok: true };
}
