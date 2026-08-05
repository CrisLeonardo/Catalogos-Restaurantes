/* ============================================================
   CANAL DE ORIGEN DEL PEDIDO — una sola fuente de verdad
   ------------------------------------------------------------
   `source` (migración 101) responde "¿por dónde ENTRÓ el pedido?", que no
   es lo mismo que `order_type` ("¿cómo se entrega?"): un pedido puede ser
   source=WHATSAPP y order_type=PICKUP a la vez.

   LEOGIN no lleva etiqueta a propósito. Es el canal de casa y la tarjeta
   ya lo describe mejor con quién lo tomó (nombre del mesero / "QR en mesa"
   / "En línea"); poner además un chip "Leogin" en todos los pedidos sería
   ruido en la pantalla que más se mira. El canal solo se muestra cuando el
   pedido NO es propio, que es justo cuando el dato cambia algo: ese pedido
   llegó de afuera y nadie del local lo escribió.
   ============================================================ */

import type { OrderSource } from '@/types';

type SourceBadge = { icon: string; text: string };

const SOURCE_BADGE: Record<Exclude<OrderSource, 'LEOGIN'>, SourceBadge> = {
  WHATSAPP:  { icon: 'whatsapp', text: 'WhatsApp' },
  PEDIDOSYA: { icon: 'truck',    text: 'PedidosYa' },
  RAPPI:     { icon: 'truck',    text: 'Rappi' },
  UBEREATS:  { icon: 'truck',    text: 'UberEats' },
  OTRO:      { icon: 'globe',    text: 'Integración' },
};

/**
 * Etiqueta del canal externo, o null si el pedido es propio (LEOGIN).
 * Null también ante un valor desconocido: el CHECK de la migración 101 lo
 * impide en la base, pero un pedido no debe dejar de renderizarse por un
 * canal que este build todavía no conoce.
 */
export function sourceBadge(source: OrderSource | null | undefined): SourceBadge | null {
  if (!source || source === 'LEOGIN') return null;
  return SOURCE_BADGE[source] ?? null;
}
