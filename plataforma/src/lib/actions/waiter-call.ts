'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPushToRestaurant } from '@/lib/push';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type WaiterCall = {
  id: string;
  table_number: number | null;
  created_at: string;
  /** Para qué llamó (migración 122). Las llamadas viejas son 'call'. */
  reason?: 'call' | 'bill';
};

/** Para qué llama el comensal. 'bill' es la que libera la mesa, así que en
    el salón pesa más que una llamada genérica — ver lib/table-state.ts. */
export type CallReason = 'call' | 'bill';

/**
 * ¿Este error es «la columna `reason` todavía no existe aquí»?
 *
 * `faltaLaColumna` cubre los dos síntomas —escribir y leer— de que la
 * migración 122 no ha corrido en este entorno. Se comprueba eso Y que el
 * mensaje hable de `reason`, para no tragarse por accidente otro fallo de
 * esquema y dejarlo pasar como si nada.
 *
 * Mensaje real: "Could not find the 'reason' column of 'waiter_calls' in the
 * schema cache".
 */
function isMissingReason(error: { code?: string; message?: string } | null): boolean {
  // El `!error` sobra para la comprobación —`faltaLaColumna` ya trata el
  // null— pero es lo que le dice a TypeScript que abajo hay mensaje.
  if (!error || !faltaLaColumna(error)) return false;
  return /reason/i.test(error.message ?? '');
}

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
  reason: CallReason = 'call',
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

  // Solo dos valores posibles: lo que venga del cliente no entra crudo.
  const motivo: CallReason = reason === 'bill' ? 'bill' : 'call';

  /* La columna `reason` es de la migración 122. Si el código llega a un
     entorno donde esa migración todavía no corrió, el insert falla y el
     comensal se queda SIN poder llamar al mesero — una función que ya
     existía y que no tiene por qué caerse por una mejora. Así que se
     intenta con motivo y, si la columna no está, se reintenta sin ella:
     se pierde el detalle, no el servicio. */
  const base = { restaurant_id: restaurantId, table_number: table };
  let { error } = await db.from('waiter_calls').insert({ ...base, reason: motivo });

  if (error && isMissingReason(error)) {
    ({ error } = await db.from('waiter_calls').insert(base));
  }

  if (error) return { error: error.message };

  const tableLabel = table ? ` · Mesa ${table}` : '';
  sendPushToRestaurant(restaurantId, {
    title: motivo === 'bill' ? '💵 Piden la cuenta' : '🔔 Llamada al mesero',
    body: motivo === 'bill'
      ? `Un cliente${tableLabel} pide la cuenta.`
      : `Un cliente${tableLabel} necesita atención.`,
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
  const pedir = (cols: string) => db
    .from('waiter_calls')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .is('resolved_at', null)
    .order('created_at', { ascending: true });

  // Mismo cuidado que en el insert: si la migracion 122 no corrio en este
  // entorno, `reason` no existe y pedirla tumbaria la consulta ENTERA. Sin
  // este reintento el panel diria "no hay llamadas" con el salon llamando.
  let { data, error } = await pedir('id, table_number, created_at, reason');
  if (error && isMissingReason(error)) ({ data, error } = await pedir('id, table_number, created_at'));

  if (error) return [];
  return (data ?? []) as unknown as WaiterCall[];
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
