/* ============================================================
   SEGUIMIENTO DEL PEDIDO PARA EL COMENSAL (auditoría 1.12, M06)
   ------------------------------------------------------------
   Pasos con la hora real de cada uno:
     Recibido → Aceptado → En preparación (platos listos) → Listo
     → En camino (domicilio) → Servido (mesa) / Entregado.
   Antes «Recibido» y «En preparación» eran lo único previo a «Listo», y
   bajo «Recibido» se repetía un «Tiempo estimado: 20–30 min» fijo. No se
   muestra ningún tiempo estimado (decisión del dueño, 2026-11-09).
   Si sigue «Recibido» 10 minutos, se dice y se da cómo contactar
   (decisión del dueño, 2026-11-09).
   ============================================================ */

import type { OrderStatus } from '@/types';

export const MINUTOS_PARA_AVISAR = 10;

export type EstadoPaso = 'hecho' | 'activo' | 'pendiente';
export type ClavePaso = 'recibido' | 'aceptado' | 'preparando' | 'listo' | 'camino' | 'final';

export interface Paso {
  clave: ClavePaso;
  label: string;
  estado: EstadoPaso;
  /** ISO de cuando ocurrió, si se sabe. */
  hora: string | null;
  /** «2 de 3 platos listos», «Esperando que lo acepte». */
  detalle: string | null;
}

export interface PedidoParaSeguir {
  status: OrderStatus;
  orderType: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  finishedAt?: string | null;
  /** Platos que pasan por cocina y cuántos ya marcó como preparados. */
  platos?: { listos: number; total: number } | null;
}

export interface TextosSeguimiento {
  recibido: string;
  preparando: string;
  listo: string;
  listoRecoger: string;
  camino: string;
  servido: string;
  entregado: string;
}

const ORDEN: Record<OrderStatus, number> = { NEW: 0, PREP: 1, READY: 2, TRANSIT: 3, SERVED: 4, DELIVERED: 4, CANCEL: -1 };

/** Los pasos que aplican a este tipo de pedido, con su estado y hora. */
export function pasosDelSeguimiento(p: PedidoParaSeguir, t: TextosSeguimiento): Paso[] {
  const n = ORDEN[p.status] ?? 0;
  const mesa = p.orderType === 'DINE_IN';
  const domicilio = p.orderType === 'DELIVERY';
  const estado = (desde: number, hasta: number): EstadoPaso => (n > hasta ? 'hecho' : n >= desde ? 'activo' : 'pendiente');

  const platos = p.platos && p.platos.total > 0 ? p.platos : null;
  const pasos: Paso[] = [
    { clave: 'recibido', label: t.recibido, estado: n > 0 ? 'hecho' : 'activo', hora: p.createdAt,
      detalle: n === 0 ? 'Esperando que el restaurante lo acepte' : null },
    // El mesero toma pedidos que nacen en preparación: aceptado sin hora.
    { clave: 'aceptado', label: 'Aceptado', estado: n >= 1 ? 'hecho' : 'pendiente', hora: n >= 1 ? p.acceptedAt ?? null : null, detalle: null },
    { clave: 'preparando', label: t.preparando, estado: estado(1, 1), hora: null,
      detalle: n === 1 && platos ? `${platos.listos} de ${platos.total} ${platos.total === 1 ? 'plato listo' : 'platos listos'}` : null },
    { clave: 'listo', label: p.orderType === 'PICKUP' ? t.listoRecoger : t.listo, estado: estado(2, 2), hora: n >= 2 ? p.readyAt ?? null : null, detalle: null },
  ];
  if (domicilio) pasos.push({ clave: 'camino', label: t.camino, estado: estado(3, 3), hora: null, detalle: null });
  pasos.push({ clave: 'final', label: mesa ? t.servido : t.entregado, estado: n >= 4 ? 'hecho' : 'pendiente', hora: n >= 4 ? p.finishedAt ?? null : null, detalle: null });
  return pasos;
}

/** Minutos que lleva «Recibido» sin que lo acepten, o null si no aplica o aún no toca avisar. */
export function minutosSinAceptar(p: PedidoParaSeguir, ahora: number = Date.now()): number | null {
  if (p.status !== 'NEW') return null;
  const min = Math.floor((ahora - new Date(p.createdAt).getTime()) / 60_000);
  return min >= MINUTOS_PARA_AVISAR ? min : null;
}
