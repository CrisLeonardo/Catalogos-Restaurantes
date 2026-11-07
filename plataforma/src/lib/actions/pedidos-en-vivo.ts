'use server';

import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { labelOf } from '@/lib/payment-method';
import { STATUS_LABEL } from '@/lib/order-status';
import type { HitoPedido } from '@/lib/pedidos-en-vivo';
import { createServiceClient } from '@/lib/supabase/service';
import type { OrderStatus } from '@/types';

export async function leerHistorialPedido(restaurante: string, pedido: string): Promise<{ hitos: HitoPedido[] } | { error: string }> {
  if (!identidadCobroValida(restaurante) || !identidadCobroValida(pedido)) return { error: 'Pedido inválido.' };
  const acceso = await assertTableAccess(restaurante, ['pedidos']);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const [orden, pagos, avisos, anulaciones, actividad, lineas] = await Promise.all([
    db.from('orders').select('created_at,accepted_at,ready_at,picked_up_at,served_at,delivered_at,cancelled_at,auto_archived_at,cocina_salida_at')
      .eq('restaurant_id', restaurante).eq('id', pedido).maybeSingle(),
    db.from('order_payments').select('id,created_at,method,amount,kind,taken_by,reason')
      .eq('restaurant_id', restaurante).eq('order_id', pedido).order('created_at').order('id'),
    db.from('whatsapp_messages').select('id,created_at')
      .eq('restaurant_id', restaurante).eq('order_id', pedido).eq('direction', 'OUT').eq('status', 'failed').order('created_at').order('id'),
    db.from('order_voids').select('id,created_at,reason,item_id,quantity,requested_by,approved_by')
      .eq('restaurant_id', restaurante).eq('order_id', pedido).order('created_at').order('id'),
    db.from('activity_log').select('id,created_at,action,entity,actor_id,meta')
      .eq('restaurant_id', restaurante)
      .or(`and(action.eq.pedido_en_vivo,entity.eq.${pedido}),and(action.eq.order_status,meta->>orderId.eq.${pedido}),and(action.eq.cocina,meta->>pedido.eq.${pedido})`)
      .order('created_at').order('id'),
    db.from('order_items').select('id,name_snapshot,orders!inner(restaurant_id)')
      .eq('order_id', pedido).eq('orders.restaurant_id', restaurante),
  ]);
  if (orden.error || pagos.error || avisos.error || anulaciones.error || actividad.error || lineas.error) {
    return { error: 'No se pudo leer todo el historial. Vuelve a cargarlo.' };
  }
  if (!orden.data) return { error: 'Pedido no disponible.' };
  const o = orden.data;
  const personas = [...new Set([
    ...pagos.data.map((p) => p.taken_by), ...actividad.data.map((a) => a.actor_id),
    ...anulaciones.data.flatMap((a) => [a.requested_by, a.approved_by]),
  ].filter((id): id is string => typeof id === 'string'))];
  const { data: perfiles } = personas.length ? await db.from('profiles').select('id,full_name').in('id', personas) : { data: [] };
  const nombres = new Map((perfiles ?? []).map(({ id, full_name }) => [id, full_name]));
  const platos = new Map(lineas.data.map(({ id, name_snapshot }) => [id, name_snapshot]));
  const hitos: HitoPedido[] = [{ id: 'recibido', hora: o.created_at, titulo: 'Pedido recibido' }];
  const conBitacora = new Set<string>();
  const etapas: Partial<Record<OrderStatus, string>> = {
    PREP: 'Aceptado y enviado a cocina', READY: 'Preparación terminada', TRANSIT: 'Salió a entregar',
    SERVED: 'Servido en mesa', DELIVERED: 'Entrega registrada',
  };
  for (const a of actividad.data) {
    const detalle = nombres.get(a.actor_id) || undefined;
    const estado = (a.action === 'order_status' ? a.entity : a.meta?.estado) as OrderStatus;
    let titulo: string | undefined;
    if (a.action === 'cocina') {
      if (a.entity === 'aceptar') titulo = etapas.PREP;
      else if (a.entity === 'preparar') titulo = estado === 'READY' ? etapas.READY : 'Preparación parcial lista';
      else if (a.entity === 'salida') titulo = 'Cocina confirmó el retiro';
      else if (a.entity === 'reabrir') titulo = 'Cocina reabrió la preparación';
      else if (a.entity === 'anulacion') titulo = 'Cocina confirmó la anulación';
      else if (a.entity === 'reimpresion') titulo = 'Copia enviada a impresión';
      if (a.entity === 'salida') conBitacora.add('pase');
      if (titulo && titulo === etapas[estado]) conBitacora.add(estado);
    } else if (a.meta?.solicitud?.destino !== 'CANCEL') {
      titulo = etapas[estado];
      if (titulo) conBitacora.add(estado);
    }
    if (titulo) hitos.push({ id: `actividad-${a.id}`, hora: a.created_at, titulo, detalle });
  }
  const marcas: [OrderStatus | 'pase', string | null][] = [
    ['PREP',o.accepted_at], ['READY',o.ready_at], ['pase',o.cocina_salida_at], ['TRANSIT',o.picked_up_at],
    ['SERVED',o.served_at], ['DELIVERED',o.delivered_at],
  ];
  for (const [estado, hora] of marcas) {
    if (hora && !conBitacora.has(estado)) hitos.push({ id: estado, hora, titulo: estado === 'pase' ? 'Cocina confirmó el retiro' : etapas[estado] ?? STATUS_LABEL[estado] });
  }
  if (o.cancelled_at && !anulaciones.data.some((a) => !a.item_id)) {
    hitos.push({ id: 'cancelado', hora: o.cancelled_at, titulo: o.auto_archived_at ? 'Archivado por inactividad' : 'Pedido anulado',
      detalle: o.auto_archived_at ? undefined : 'No hay motivo ni responsable registrados.', alerta: !o.auto_archived_at });
  }
  for (const a of anulaciones.data) {
    const quien = nombres.get(a.requested_by) || 'Responsable sin nombre';
    const firma = a.approved_by && a.approved_by !== a.requested_by ? nombres.get(a.approved_by) || 'Encargado sin nombre' : null;
    hitos.push({ id: `anulacion-${a.id}`, hora: a.created_at, alerta: true,
      titulo: a.item_id ? `Anulación · ${a.quantity}× ${platos.get(a.item_id) ?? 'Plato'}` : 'Pedido anulado',
      detalle: [a.reason, `Por ${quien}`, firma && `Autorizó ${firma}`].filter(Boolean).join(' · ') });
  }
  for (const p of pagos.data) {
    const titulo = p.kind === 'REFUND' ? 'Devolución registrada' : p.kind === 'METHOD_FIX' ? 'Método de cobro corregido'
      : p.kind === 'REOPEN' ? 'Cobro revertido al reabrir' : 'Cobro registrado';
    hitos.push({ id: `pago-${p.id}`, hora: p.created_at, titulo, monto: Number(p.amount),
      detalle: [labelOf(p.method), nombres.get(p.taken_by), p.reason].filter(Boolean).join(' · ') || undefined });
  }
  for (const a of avisos.data) hitos.push({ id: `aviso-${a.id}`, hora: a.created_at, titulo: 'Falló un aviso por WhatsApp', alerta: true });
  return { hitos: hitos.sort((a,b) => a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id)) };
}
