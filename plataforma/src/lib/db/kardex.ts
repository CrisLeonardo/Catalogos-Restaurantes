import { createServiceClient } from '@/lib/supabase/service';

export type StockMovement = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number | null;
  unit_cost: number | null;
  avg_cost_after: number | null;
  created_at: string;
};

const MOVEMENT_COLUMNS = 'id, delta, reason, balance_after, unit_cost, avg_cost_after, created_at';

export async function getProductMovements(restaurantId: string, productId: string, limit = 50): Promise<StockMovement[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('stock_movements')
    .select(MOVEMENT_COLUMNS)
    .eq('restaurant_id', restaurantId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StockMovement[];
}

export async function getIngredientMovements(restaurantId: string, ingredientId: string, limit = 50): Promise<StockMovement[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('stock_movements')
    .select(MOVEMENT_COLUMNS)
    .eq('restaurant_id', restaurantId)
    .eq('ingredient_id', ingredientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StockMovement[];
}
