'use server';

import { after } from 'next/server';
import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueKitchenForOrder } from '@/lib/print-agent';
import { notifyOrderStatus } from '@/lib/whatsapp/notify';
import { logActivity } from '@/lib/activity';
import { revalidarSalon } from '@/lib/salon-cache';

export type AccionCocina = 'aceptar' | 'preparar' | 'reabrir' | 'salida' | 'anulacion';
type CambioCocina = { estado: string; cambio: boolean; marca?: string; lineas?: string[] };

export async function transicionCocina(
  restaurante: string, pedido: string, accion: AccionCocina, lineas: string[] = [], marca: string | null = null,
): Promise<{ error: string } | CambioCocina> {
  if (!identidadCobroValida(restaurante) || !identidadCobroValida(pedido) ||
      !Array.isArray(lineas) || lineas.length > 250 || !lineas.every(identidadCobroValida) ||
      (marca !== null && (typeof marca !== 'string' || !Number.isFinite(Date.parse(marca))))) {
    return { error: 'Datos de cocina inválidos.' };
  }
  const acceso = await assertTableAccess(restaurante, ['cocina']);
  if ('error' in acceso) return acceso;
  const { data, error } = await createServiceClient().rpc('leogin_transicion_cocina', {
    p_restaurante: restaurante, p_pedido: pedido, p_accion: accion, p_actor: acceso.actor.userId,
    p_lineas: lineas, p_marca: marca,
  });
  if (error || !data) return { error: error?.code === 'LGD01' ? error.message : 'No se pudo actualizar la comanda.' };
  const resultado = data as CambioCocina;
  if (resultado.cambio && accion === 'aceptar') {
    after(async () => {
      await Promise.allSettled([enqueueKitchenForOrder(restaurante, pedido), notifyOrderStatus(pedido, 'PREP')]);
    });
  }
  if (resultado.cambio && resultado.estado === 'READY' && (accion === 'preparar' || accion === 'anulacion')) {
    after(() => notifyOrderStatus(pedido, 'READY'));
  }
  revalidarSalon();
  return resultado;
}

export async function reimprimirCopiaCocina(
  restaurante: string, pedido: string, motivo: string, estacion?: string,
): Promise<{ error?: string }> {
  if (!identidadCobroValida(restaurante) || !identidadCobroValida(pedido) ||
      (estacion && !identidadCobroValida(estacion)) || typeof motivo !== 'string' ||
      motivo.trim().length === 0 || motivo.trim().length > 120) {
    return { error: 'Escribe un motivo de hasta 120 caracteres.' };
  }
  const acceso = await assertTableAccess(restaurante, ['cocina']);
  if ('error' in acceso) return acceso;
  const { data } = await createServiceClient().from('orders').select('id')
    .eq('id', pedido).eq('restaurant_id', restaurante).maybeSingle();
  if (!data) return { error: 'Comanda no encontrada.' };
  const razon = motivo.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!razon) return { error: 'Escribe un motivo legible para la copia.' };
  const resultado = await enqueueKitchenForOrder(restaurante, pedido, { force: true, stationId: estacion, copyReason: razon });
  if (!resultado.queued) {
    return { error: resultado.message ?? 'No se pudo encolar la copia. Revisa la impresora desde el panel.' };
  }
  await logActivity({
    restaurantId: restaurante, actorId: acceso.actor.userId, action: 'cocina',
    entity: 'reimpresion', meta: { pedido, estacion, motivo: razon },
  });
  revalidarSalon();
  return {};
}
