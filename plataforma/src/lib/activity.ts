import { createServiceClient } from '@/lib/supabase/service';

/* Bitácora de actividad (Fase D). Fire-and-forget: nunca debe romper
   la acción principal. Se ve en /admin/personal. */
export async function logActivity(input: {
  restaurantId: string;
  actorId?: string | null;
  action: string;            // 'order_status' | 'product' | 'stock' | 'promo' | 'staff'
  entity?: string | null;    // nombre/numero corto
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from('activity_log').insert({
      restaurant_id: input.restaurantId,
      actor_id: input.actorId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      meta: input.meta ?? null,
    });
  } catch {
    // La bitácora jamás debe interrumpir la operación.
  }
}
