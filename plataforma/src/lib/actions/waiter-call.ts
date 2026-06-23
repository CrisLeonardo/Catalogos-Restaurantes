'use server';

import { createServiceClient } from '@/lib/supabase/service';

export async function callWaiter(
  restaurantId: string,
  tableNumber: number | null,
): Promise<{ ok?: boolean; error?: string }> {
  if (!restaurantId) return { error: 'Restaurante no especificado.' };

  const db = createServiceClient();
  const { error } = await db.from('waiter_calls').insert({
    restaurant_id: restaurantId,
    table_number: tableNumber ?? null,
  });

  if (error) return { error: error.message };
  return { ok: true };
}

export async function resolveWaiterCall(callId: string): Promise<{ ok?: boolean; error?: string }> {
  const db = createServiceClient();
  const { error } = await db
    .from('waiter_calls')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', callId);

  if (error) return { error: error.message };
  return { ok: true };
}
