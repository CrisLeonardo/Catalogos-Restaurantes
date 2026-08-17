'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPushToRestaurant } from '@/lib/push';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';

const UUID_RE = /^[0-9a-f-]{36}$/i;

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
  return profile.role === 'SUPER_ADMIN' || (await canActOnRestaurant(profile.restaurant_id, restaurantId));
}

/**
 * El comensal llama al mesero (público, anónimo).
 *
 * Es una de las poquísimas acciones que cualquiera en internet puede invocar
 * sin sesión, y dispara una notificación push a los dispositivos del personal.
 * Sin los controles de abajo, cualquiera podía inundar de alertas a un
 * restaurante con solo repetir la llamada (basta su restaurantId, que es
 * público en el menú). De ahí: límite por IP, techo por restaurante —para que
 * un atacante con muchas IPs tampoco lo logre—, y comprobar que el módulo
 * "Llamar al mesero" esté realmente activo.
 */
export async function callWaiter(
  restaurantId: string,
  tableNumber: number | null,
): Promise<{ ok?: boolean; error?: string }> {
  if (!UUID_RE.test(restaurantId ?? '')) return { error: 'Restaurante no especificado.' };

  // Mesa: entero razonable o nada (evita guardar basura del cliente).
  const table =
    tableNumber == null || !Number.isFinite(tableNumber)
      ? null
      : Math.trunc(tableNumber) >= 1 && Math.trunc(tableNumber) <= 9999
        ? Math.trunc(tableNumber)
        : null;

  const ip = clientIp(await headers());
  if (!(await rateLimit(`waiter:${ip}:${restaurantId}`, 5, 5 * 60_000)) ||
      !(await rateLimit(`waiter:${restaurantId}`, 60, 5 * 60_000))) {
    return { error: 'Ya avisamos al mesero. Espera un momento.' };
  }

  const db = createServiceClient();

  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings, status')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!rest || rest.status !== 'active') return { error: 'Restaurante no disponible.' };
  if (!isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'llamada_mesero')) {
    return { error: 'Este restaurante no tiene activada la llamada al mesero.' };
  }

  const { error } = await db.from('waiter_calls').insert({
    restaurant_id: restaurantId,
    table_number: table,
  });

  if (error) return { error: error.message };

  const tableLabel = table ? ` · Mesa ${table}` : '';
  sendPushToRestaurant(restaurantId, {
    title: '🔔 Llamada al mesero',
    body: `Un cliente${tableLabel} necesita atención.`,
    tag: `waiter-${restaurantId}-${Date.now()}`,
    url: '/admin/mesas',
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300, 200, 600],
    type: 'waiter_call',
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
