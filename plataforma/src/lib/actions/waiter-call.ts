'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPushToRestaurant } from '@/lib/push';

export type WaiterCall = {
  id: string;
  table_number: number | null;
  created_at: string;
};

/** ¿El usuario autenticado pertenece a este restaurante (o es super admin)? */
async function authorizedFor(restaurantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return false;
  return profile.role === 'SUPER_ADMIN' || profile.restaurant_id === restaurantId;
}

/** El comensal llama al mesero (público, anónimo). */
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

  const tableLabel = tableNumber ? ` · Mesa ${tableNumber}` : '';
  sendPushToRestaurant(restaurantId, {
    title: '🔔 Llamada al mesero',
    body: `Un cliente${tableLabel} necesita atención.`,
    tag: `waiter-${restaurantId}-${Date.now()}`,
    url: '/admin/mesas',
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300, 200, 600],
  }).catch(() => {});

  return { ok: true };
}

/** Llamadas pendientes (sin resolver) de un restaurante — para el panel. */
export async function getPendingWaiterCalls(restaurantId: string): Promise<WaiterCall[]> {
  if (!restaurantId) return [];
  if (!(await authorizedFor(restaurantId))) return [];

  const db = createServiceClient();
  const { data, error } = await db
    .from('waiter_calls')
    .select('id, table_number, created_at')
    .eq('restaurant_id', restaurantId)
    .is('resolved_at', null)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as WaiterCall[];
}

/** Marca una llamada como atendida (solo staff/dueño del restaurante). */
export async function resolveWaiterCall(callId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!callId) return { error: 'Llamada no especificada.' };

  const db = createServiceClient();
  const { data: call } = await db
    .from('waiter_calls')
    .select('restaurant_id')
    .eq('id', callId)
    .single();
  if (!call) return { error: 'Llamada no encontrada.' };
  if (!(await authorizedFor(call.restaurant_id as string))) return { error: 'No autorizado.' };

  const { error } = await db
    .from('waiter_calls')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', callId);

  if (error) return { error: error.message };
  return { ok: true };
}
