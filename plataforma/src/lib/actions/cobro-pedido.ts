'use server';

/* ============================================================
   COBRAR UN PEDIDO EN LÍNEA (auditoría del 26-nov-2026, hallazgo 1)
   ------------------------------------------------------------
   Entregar y cobrar son dos hechos. El método que eligió el cliente en
   la carta es lo que DIJO que iba a usar; el cobro es lo que entró, y
   desde la migración 207 solo cuenta lo que se registra aquí (o en
   Servicio, para mesas y mostrador).

   Lo registra `leogin_cobrar_pedido` bajo bloqueo de la fila: cobra el
   saldo que falte y, si ya no falta nada —un reintento, o la otra
   pantalla se adelantó—, no escribe nada. Nunca dos cobros.

   Lo puede hacer quien cobra en caja y también quien atiende pedidos:
   en un local chico, quien entrega el «para recoger» es quien recibe el
   dinero.
   ============================================================ */

import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { isPaymentMethod, labelOf } from '@/lib/payment-method';
import { revalidarSalon } from '@/lib/salon-cache';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaFuncion } from '@/lib/db/migracion-ausente';
import { revalidatePath } from 'next/cache';

export type ResultadoCobroPedido =
  | { ok: true; cobrado: number; yaCobrado: boolean; metodo: string }
  | { error: string };

export async function cobrarPedido(
  restaurantId: string,
  orderId: string,
  metodo: string,
  recibido?: number | null,
): Promise<ResultadoCobroPedido> {
  if (!identidadCobroValida(restaurantId) || !identidadCobroValida(orderId)) return { error: 'Pedido inválido.' };
  if (!isPaymentMethod(metodo)) return { error: 'Elige cómo pagó el cliente.' };
  const efectivo = metodo === 'CASH' && recibido != null && Number.isFinite(recibido) && recibido > 0
    ? Math.round(recibido * 100) / 100 : null;

  const acceso = await assertTableAccess(restaurantId, ['caja.cobrar', 'pedidos']);
  if ('error' in acceso) return acceso;

  const { data, error } = await createServiceClient().rpc('leogin_cobrar_pedido', {
    p_restaurante: restaurantId, p_pedido: orderId, p_actor: acceso.actor.userId,
    p_metodo: metodo, p_recibido: efectivo,
  });
  if (error) {
    if (faltaLaFuncion(error)) return { error: 'Falta aplicar la migración 207 para cobrar pedidos en línea.' };
    return { error: error.code === 'LGD01' ? error.message : 'No se pudo registrar el cobro. Revisa el pedido antes de intentarlo de nuevo.' };
  }
  const r = data as { cobrado: number; yaCobrado: boolean; metodo: string };
  revalidatePath('/admin/caja');
  revalidarSalon();
  return { ok: true, cobrado: Number(r.cobrado) || 0, yaCobrado: r.yaCobrado === true, metodo: labelOf(r.metodo) };
}
