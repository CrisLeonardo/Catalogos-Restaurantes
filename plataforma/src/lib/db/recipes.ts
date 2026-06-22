import { createServiceClient } from '@/lib/supabase/service';

export type Ingredient = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
};

export type RecipeItem = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient_name: string;
  ingredient_unit: string;
  ingredient_cost: number;
  line_cost: number;
};

export async function getIngredients(restaurantId: string): Promise<Ingredient[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Ingredient[];
}

export async function getProductRecipe(productId: string): Promise<RecipeItem[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('recipe_items')
    .select('id, product_id, ingredient_id, quantity, ingredients(name, unit, cost_per_unit)')
    .eq('product_id', productId);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const ing = (r.ingredients as unknown) as { name: string; unit: string; cost_per_unit: number } | null;
    return {
      id: r.id as string,
      product_id: r.product_id as string,
      ingredient_id: r.ingredient_id as string,
      quantity: r.quantity as number,
      ingredient_name: ing?.name ?? '',
      ingredient_unit: ing?.unit ?? '',
      ingredient_cost: ing?.cost_per_unit ?? 0,
      line_cost: (r.quantity as number) * (ing?.cost_per_unit ?? 0),
    };
  });
}

/** Cuántos platillos usa cada ingrediente (para el panel de ingredientes). */
export async function getIngredientUsageCounts(restaurantId: string): Promise<Record<string, number>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('recipe_items')
    .select('ingredient_id, products!inner(restaurant_id)')
    .eq('products.restaurant_id', restaurantId);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const iid = row.ingredient_id as string;
    counts[iid] = (counts[iid] ?? 0) + 1;
  }
  return counts;
}
