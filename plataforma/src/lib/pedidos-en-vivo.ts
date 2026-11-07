import type { OrderWithItems } from '@/lib/db/orders';
import { fmtElapsed, stageClock } from '@/lib/order-status';

export type ResumenPedidoVivo = { cobrado: number; movimientos: number; avisoFallido: boolean };
export type HitoPedido = { id: string; hora: string; titulo: string; detalle?: string; monto?: number; alerta?: boolean };

export function estadoDelCobro(resumen: ResumenPedidoVivo | undefined, total: number, efectivoEnEntrega?: number | null) {
  if (!resumen) return 'Cobro sin verificar';
  if (!resumen.movimientos && Number(efectivoEnEntrega) > 0) return 'Efectivo reportado por reparto';
  if (!resumen.movimientos) return 'Sin cobro registrado';
  if (resumen.cobrado <= 0) return 'Sin cobro neto';
  if (Math.round(resumen.cobrado * 100) < Math.round(total * 100)) return 'Cobro parcial';
  return 'Cobro registrado';
}

export function incidenciasDePedido(
  pedido: OrderWithItems, ahora: number | null, amarillo: number, rojo: number, impresion: boolean, aviso: boolean,
) {
  const reloj = stageClock(pedido, amarillo, rojo);
  const demora = reloj && ahora !== null ? ahora - Date.parse(reloj.since) : 0;
  return [
    reloj && demora >= reloj.redMin * 60_000 ? `${fmtElapsed(demora)} ${reloj.label}` : '',
    impresion ? 'Falló la impresión' : '',
    aviso ? 'Falló un aviso al cliente' : '',
  ].filter(Boolean);
}
