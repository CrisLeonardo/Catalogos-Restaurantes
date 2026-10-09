/* ============================================================
   WEB PUSH — envío server-side de notificaciones push
   Se llama desde createOrder() después de insertar el pedido.
   Requiere las variables de entorno VAPID_* configuradas.
   ============================================================ */

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/service';
import { panelPath, stableRootUrl } from '@/lib/tenant';

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
  /**
   * Categoría del push (p.ej. 'waiter_call'). El service worker la reenvía
   * por postMessage a las pestañas abiertas del panel admin, para que
   * reaccionen al instante (refrescar/sonar) sin depender del socket de
   * Realtime — el push ya llega rápido y confiable independientemente de él.
   */
  type?: string;
  /**
   * URL del ícono grande de la notificación. Si no se pasa, sendPushToRestaurant
   * la rellena con el logo del restaurante (vía /api/icon/[slug]) para que se
   * distinga de un vistazo cuál restaurante mandó el aviso.
   */
  icon?: string;
}

/**
 * A DÓNDE lleva el aviso al tocarlo.
 *
 * Quien lo llama escribe la ruta interna de siempre (`/admin/pedidos`): es la
 * que renderiza Next y la única que tiene sentido en el código del servidor,
 * que no sabe por qué origen entró cada aparato. Pero el service worker abre
 * lo que reciba TAL CUAL, y desde la migración del 2026-09-02 el panel vive en
 * `<raíz>/panel/<slug>/...` — así que `/admin/pedidos` a secas sacaba a la
 * persona de su panel y, en un teléfono con la app instalada, del ámbito de la
 * PWA: la barra del navegador encima, que es justo lo que aquella migración
 * vino a quitar.
 *
 * Se manda ABSOLUTA a propósito. La notificación puede tocarse con la app
 * cerrada, sin ninguna pestaña que diga por dónde entró esta persona; una ruta
 * relativa se resolvería contra el origen del service worker, que puede ser
 * todavía el subdominio viejo del panel.
 *
 * Lo que no sea una ruta del panel (o si no se sabe el slug) pasa de largo.
 */
function destino(url: string | undefined, slug: string | null | undefined): string | undefined {
  if (!url || !slug || !url.startsWith('/admin')) return url;
  const resto = url === '/admin' ? '' : url.startsWith('/admin/') ? url.slice('/admin'.length) : null;
  if (resto === null) return url;
  return `${stableRootUrl()}${panelPath(slug)}${resto}`;
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
  const [{ data: subs }, { data: restaurant }] = await Promise.all([
    db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('restaurant_id', restaurantId),
    db.from('restaurants').select('slug').eq('id', restaurantId).single(),
  ]);

  if (!subs || subs.length === 0) return;

  const icon = payload.icon
    ?? (restaurant?.slug ? `${stableRootUrl()}/api/icon/${restaurant.slug}` : undefined);
  const body = JSON.stringify({ ...payload, icon, url: destino(payload.url, restaurant?.slug) });

  const expiredIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          body,
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

/**
 * Envía un aviso a los celulares del SUPER ADMIN que lo pidieron
 * (`super_push_subscriptions`, migración 138) — MON-04. Mismo envío que
 * `sendPushToRestaurant`, otra lista: esas suscripciones no son de ningún
 * restaurante. Devuelve a cuántos aparatos salió.
 */
export async function sendPushToSuperAdmins(payload: PushPayload): Promise<number> {
  if (!vapidConfigured) return 0;

  const db = createServiceClient();
  const { data: subs } = await db.from('super_push_subscriptions').select('id, endpoint, p256dh, auth');
  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify({
    ...payload,
    url: payload.url?.startsWith('/') ? `${stableRootUrl()}${payload.url}` : payload.url,
  });
  const expiredIds: string[] = [];
  let enviados = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
          body,
        );
        enviados++;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'statusCode' in err) {
          const code = (err as { statusCode: number }).statusCode;
          if (code === 410 || code === 404) expiredIds.push(sub.id as string);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db.from('super_push_subscriptions').delete().in('id', expiredIds);
  }
  return enviados;
}
