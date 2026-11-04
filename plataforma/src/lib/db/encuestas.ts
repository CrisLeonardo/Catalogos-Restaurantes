import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type Lectura } from '@/lib/db/lectura';

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

/* Un error ya no se pinta «sin calificaciones» ni promedio 0 (auditoría
   2026-11-03, X20). */
export async function getRatings(restaurantId: string, limit = 100): Promise<Lectura<OrderRating[]>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('order_ratings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return lecturaDe(error, data as OrderRating[] | null, [], { contexto: 'getRatings' });
}

export async function getRatingsSummary(restaurantId: string): Promise<Lectura<RatingsSummary>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('order_ratings')
    .select('rating, created_at')
    .eq('restaurant_id', restaurantId);
  if (error) return lecturaDe(error, null, resumenVacio(), { contexto: 'getRatingsSummary' });

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

  return lecturaDe(null, {
    total: rows.length,
    average: rows.length ? sum / rows.length : 0,
    distribution: dist as Record<1 | 2 | 3 | 4 | 5, number>,
    thisMonth: monthCount,
    avgThisMonth: monthCount ? monthSum / monthCount : 0,
  }, resumenVacio());
}

function resumenVacio(): RatingsSummary {
  return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, thisMonth: 0, avgThisMonth: 0 };
}
