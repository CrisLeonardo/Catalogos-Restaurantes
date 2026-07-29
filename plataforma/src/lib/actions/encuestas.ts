'use server';

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_COMMENT = 500;
const MAX_NAME = 80;

/**
 * El comensal califica su pedido (público, anónimo).
 *
 * Es una acción sin sesión: el único dato que hace falta para invocarla es el
 * restaurantId, que está a la vista en el menú público. Antes no validaba
 * nada más que el rango de la estrella, así que cualquiera podía hundir (o
 * inflar) el promedio de un restaurante con un bucle, con comentarios de
 * longitud ilimitada. Los controles:
 *  · la calificación debe ir atada a un pedido REAL de ese restaurante;
 *  · un pedido se califica una sola vez;
 *  · límite por IP y techo por restaurante para el resto;
 *  · textos recortados a un largo sensato.
 */
export async function submitRating(input: {
  restaurantId: string;
  rating: number;
  comment?: string;
  orderId?: string;
  customerName?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { restaurantId, rating, comment, orderId, customerName } = input;

  if (!UUID_RE.test(restaurantId ?? '')) return { error: 'Restaurante no especificado.' };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Calificación inválida.' };
  if (orderId && !UUID_RE.test(orderId)) return { error: 'Pedido inválido.' };

  const ip = clientIp(await headers());
  if (!rateLimit(`rating:${ip}`, 10, 10 * 60_000) ||
      !rateLimit(`rating:${restaurantId}`, 120, 10 * 60_000)) {
    return { error: 'Recibimos demasiadas calificaciones seguidas. Intenta en unos minutos.' };
  }

  const db = createServiceClient();

  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings, status')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!rest || rest.status !== 'active') return { error: 'Restaurante no disponible.' };
  if (!isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, 'encuestas')) {
    return { error: 'Este restaurante no tiene activadas las encuestas.' };
  }

  // Sin pedido no hay forma de saber si quien califica llegó a comer aquí.
  if (!orderId) return { error: 'No encontramos el pedido de esta calificación.' };

  const { data: order } = await db
    .from('orders')
    .select('id, restaurant_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.restaurant_id !== restaurantId) {
    return { error: 'No encontramos el pedido de esta calificación.' };
  }

  const { data: existing } = await db
    .from('order_ratings')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (existing) return { error: 'Este pedido ya fue calificado. ¡Gracias!' };

  const { error } = await db.from('order_ratings').insert({
    restaurant_id: restaurantId,
    rating,
    comment: comment?.trim().slice(0, MAX_COMMENT) || null,
    order_id: orderId,
    customer_name: customerName?.trim().slice(0, MAX_NAME) || null,
  });

  if (error) return { error: error.message };
  return { ok: true };
}
