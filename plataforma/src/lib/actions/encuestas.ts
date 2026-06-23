'use server';

import { createServiceClient } from '@/lib/supabase/service';

export async function submitRating(input: {
  restaurantId: string;
  rating: number;
  comment?: string;
  orderId?: string;
  customerName?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { restaurantId, rating, comment, orderId, customerName } = input;
  if (!restaurantId) return { error: 'Restaurante no especificado.' };
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) return { error: 'Calificación inválida.' };

  const db = createServiceClient();
  const { error } = await db.from('order_ratings').insert({
    restaurant_id: restaurantId,
    rating,
    comment: comment?.trim() || null,
    order_id: orderId ?? null,
    customer_name: customerName?.trim() || null,
  });

  if (error) return { error: error.message };
  return { ok: true };
}
