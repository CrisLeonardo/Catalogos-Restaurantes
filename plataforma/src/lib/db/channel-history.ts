import { logActivity } from '@/lib/activity';
import type { OrderType } from '@/lib/theme/defaults';

/* ============================================================
   HISTORIAL DE CANALES — bitácora legible para /admin/personal
   ------------------------------------------------------------
   El registro que importa para el COBRO (restaurant_channel_log,
   migración 073 — base de "apagado >= 75% del ciclo anterior" para
   el descuento "Plan a tu medida") lo escribe un TRIGGER en
   restaurant_themes (trg_restaurant_channel_log), no este archivo.
   Se movió de la app a un trigger porque había demasiados caminos
   reales que mutan config.orderTypes (signup, duplicar restaurante,
   /admin/ajustes, /admin/modulos, el editor de tema del super admin)
   y confiar en que cada uno se acuerde de llamar un helper es
   frágil — un trigger sobre la tabla no se puede saltar.

   Este helper solo agrega la entrada humana en activity_log ("quién
   apagó qué canal y cuándo", visible en /admin/personal). Es
   best-effort: si falla, el trigger de abajo ya protegió el cobro.
   ============================================================ */

export type BillingChannel = 'local' | 'delivery';

function channelState(orderTypes: OrderType[]): Record<BillingChannel, boolean> {
  return {
    local: orderTypes.includes('dine_in') || orderTypes.includes('pickup'),
    delivery: orderTypes.includes('delivery'),
  };
}

/** Registra en activity_log las transiciones on/off reales entre dos snapshots de orderTypes. No-op si nada cambió. */
export async function logChannelChanges(
  restaurantId: string,
  before: OrderType[],
  after: OrderType[],
  changedBy: string | null,
): Promise<void> {
  const prev = channelState(before);
  const next = channelState(after);
  const changed = (['local', 'delivery'] as BillingChannel[]).filter((c) => prev[c] !== next[c]);

  for (const channel of changed) {
    logActivity({
      restaurantId,
      actorId: changedBy,
      action: 'channel_toggle',
      entity: channel,
      meta: { active: next[channel] },
    }).catch(() => {});
  }
}
