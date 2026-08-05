/* ============================================================
   AVISOS DE ESTADO POR WHATSAPP (Fase 1A)
   ------------------------------------------------------------
   Traduce un cambio de estado del pedido a un mensaje para el comensal.
   Es el único consumidor de client.ts en esta fase.

   QUÉ SE AVISA Y QUÉ NO:
   Solo DELIVERY y PICKUP. Un DINE_IN no se avisa nunca — el comensal está
   sentado en el local, le llega la comida a la mesa y el mesero le habla;
   mandarle WhatsApp de que "su pedido está listo" es ruido, no servicio.
   Esa es también la razón de no avisar el estado SERVED, que es exclusivo
   de mesa.

   TEXTO LIBRE O PLANTILLA:
   Se intenta texto libre (más natural y sin costo de plantilla) y, si la
   ventana de 24h de Meta está cerrada, se cae a la plantilla aprobada. Es
   el caso normal, no la excepción: un cliente que pidió por el menú web
   nunca le escribió al número, así que su ventana está cerrada desde el
   principio. Por eso la plantilla NO es opcional para operar esta fase.

   Best-effort de punta a punta: si algo falla aquí, el pedido y su cambio
   de estado siguen su curso. Nunca se lanza hacia afuera.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { waDigits } from '@/lib/reminder';
import { subdomainUrl } from '@/lib/tenant';
import { sendWhatsAppText, sendWhatsAppTemplate, getAccount } from '@/lib/whatsapp/client';
import type { OrderStatus } from '@/types';

/** Plantilla aprobada en Meta para avisos de estado. Debe existir con 4
 *  variables en el cuerpo: {{1}} nombre, {{2}} número de pedido,
 *  {{3}} restaurante, {{4}} estado en palabras. */
const STATUS_TEMPLATE = process.env.WHATSAPP_STATUS_TEMPLATE || 'leogin_estado_pedido';

/** Estados que el comensal necesita saber. NEW no entra: aún no lo confirma
 *  el restaurante, avisar ahí genera falsas expectativas. */
const NOTIFIABLE: OrderStatus[] = ['PREP', 'READY', 'TRANSIT', 'DELIVERED'];

/** Frase corta del estado, la que va en la plantilla como {{4}}. */
function statusPhrase(status: OrderStatus, orderType: string): string {
  switch (status) {
    case 'PREP':
      return 'confirmado y en cocina';
    case 'READY':
      return orderType === 'DELIVERY' ? 'listo y sale en camino' : 'listo para recoger';
    case 'TRANSIT':
      return 'en camino';
    case 'DELIVERED':
      return 'entregado';
    default:
      return 'actualizado';
  }
}

/** Mensaje completo para texto libre (con emoji y enlace de seguimiento). */
function freeFormMessage(args: {
  customerName: string | null;
  orderNumber: string;
  restaurantName: string;
  status: OrderStatus;
  orderType: string;
  trackUrl: string | null;
}): string {
  const saludo = args.customerName ? `Hola ${args.customerName} 👋` : 'Hola 👋';

  const cuerpo =
    args.status === 'PREP'
      ? `Confirmamos tu pedido *${args.orderNumber}* en *${args.restaurantName}*. Ya está en cocina 👨‍🍳`
      : args.status === 'READY'
        ? args.orderType === 'DELIVERY'
          ? `Tu pedido *${args.orderNumber}* ya está listo y sale en camino 🛵`
          : `Tu pedido *${args.orderNumber}* ya está listo para recoger 🛍️`
        : args.status === 'TRANSIT'
          ? `Tu pedido *${args.orderNumber}* va en camino 🛵`
          : `Tu pedido *${args.orderNumber}* fue entregado. ¡Gracias por tu compra! 🙌`;

  const seguimiento = args.trackUrl ? `\n\nSeguilo aquí: ${args.trackUrl}` : '';
  return `${saludo}\n\n${cuerpo}${seguimiento}`;
}

/**
 * Avisa al comensal el nuevo estado de su pedido.
 * No lanza nunca: registra y sigue.
 */
export async function notifyOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  try {
    if (!NOTIFIABLE.includes(status)) return;

    const db = createServiceClient();
    const { data: order } = await db
      .from('orders')
      .select('id, restaurant_id, order_number, customer_name, customer_phone, order_type, public_token')
      .eq('id', orderId)
      .single();

    if (!order) return;

    // DINE_IN nunca (ver cabecera).
    const orderType = order.order_type as string;
    if (orderType === 'DINE_IN') return;

    const waId = waDigits(order.customer_phone as string | null);
    if (!waId) return;

    const restaurantId = order.restaurant_id as string;

    const { data: restaurant } = await db
      .from('restaurants')
      .select('name, slug, orders_whatsapp_enabled')
      .eq('id', restaurantId)
      .single();

    if (!restaurant) return;

    // Mismo interruptor que apaga el botón de "pedir por WhatsApp" en el
    // checkout (migración 096): si el dueño lo apagó, tampoco le mandamos
    // avisos a sus clientes. Un solo control para todo el canal.
    if (restaurant.orders_whatsapp_enabled === false) return;

    // Sin número conectado no hay nada que hacer (la mayoría de restaurantes
    // hasta que completen la conexión en /admin/whatsapp).
    if (!(await getAccount(restaurantId))) return;

    const trackUrl = order.public_token
      ? `${subdomainUrl(restaurant.slug as string)}/pedido/${order.public_token}`
      : null;

    const text = freeFormMessage({
      customerName: (order.customer_name as string | null)?.split(' ')[0] ?? null,
      orderNumber: order.order_number as string,
      restaurantName: restaurant.name as string,
      status,
      orderType,
      trackUrl,
    });

    const sent = await sendWhatsAppText(restaurantId, waId, text, { orderId });

    // Ventana cerrada = caso normal para un pedido del menú web. Plantilla.
    if (!sent.ok && sent.reason === 'window_closed') {
      await sendWhatsAppTemplate(
        restaurantId,
        waId,
        STATUS_TEMPLATE,
        [
          ((order.customer_name as string | null)?.split(' ')[0]) || 'cliente',
          order.order_number as string,
          restaurant.name as string,
          statusPhrase(status, orderType),
        ],
        { orderId },
      );
    }
  } catch {
    /* best-effort: el canal de avisos jamás rompe la operación */
  }
}
