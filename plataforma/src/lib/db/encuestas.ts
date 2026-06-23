import { createServiceClient } from '@/lib/supabase/service';

export interface OrderRating {
  id: string;
  restaurant_id: string;
  order_id: string | null;
  rating: number;
  comment: string | null;
  customer_name: string | null;
  created_at: string;
}

export interface RatingsSummary {
  total: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  thisMonth: number;
  avgThisMonth: number;
}

export async function getRatings(restaurantId: string, limit = 100): Promise<OrderRating[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('order_ratings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as OrderRating[];
}

export async function getRatingsSummary(restaurantId: string): Promise<RatingsSummary> {
  const db = createServiceClient();
  const { data } = await db
    .from('order_ratings')
    .select('rating, created_at')
    .eq('restaurant_id', restaurantId);

  const rows = data ?? [];
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let monthSum = 0, monthCount = 0;

  for (const r of rows) {
    const rating = Number(r.rating);
    dist[rating] = (dist[rating] ?? 0) + 1;
    sum += rating;
    if (new Date(r.created_at as string) >= monthStart) {
      monthSum += rating;
      monthCount++;
    }
  }

  return {
    total: rows.length,
    average: rows.length ? sum / rows.length : 0,
    distribution: dist as Record<1 | 2 | 3 | 4 | 5, number>,
    thisMonth: monthCount,
    avgThisMonth: monthCount ? monthSum / monthCount : 0,
  };
}
