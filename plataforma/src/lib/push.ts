/* ============================================================
   WEB PUSH — envío server-side de notificaciones push
   Se llama desde createOrder() después de insertar el pedido.
   Requiere las variables de entorno VAPID_* configuradas.
   ============================================================ */

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/service';

const vapidConfigured =
  process.env.VAPID_PRIVATE_KEY &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_SUBJECT;

if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
  vibrate?: number[];
}

/**
 * Envía una notificación push a todos los dispositivos suscritos
 * del restaurante. Las suscripciones expiradas o inválidas se borran
 * automáticamente.
 */
export async function sendPushToRestaurant(
  restaurantId: string,
  payload: PushPayload,
): Promise<void> {
  if (!vapidConfigured) return;

  const db = createServiceClient();
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('restaurant_id', restaurantId);

  if (!subs || subs.length === 0) return;

  const expiredIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        // 410 Gone = suscripción expirada o el usuario la desactivó manualmente.
        if (err && typeof err === 'object' && 'statusCode' in err) {
          const code = (err as { statusCode: number }).statusCode;
          if (code === 410 || code === 404) {
            expiredIds.push(sub.id as string);
          }
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db.from('push_subscriptions').delete().in('id', expiredIds);
  }
}
