/* ============================================================
   CICLO DE VIDA DE UN PEDIDO — una sola fuente de verdad
   ------------------------------------------------------------
   Antes esto vivía copiado en tres pantallas (panel de pedidos,
   panel de mesero y KDS), cada copia con sus propias etiquetas y
   sus propios colores. Se fueron separando: el mismo pedido se
   llamaba "Nuevo" en una pantalla, "Preparando" en otra y
   "En preparación" en la tercera.

   Las etiquetas describen lo que PASA con el pedido, no el nombre
   técnico del estado: quien está en la caja no piensa "NEW",
   piensa "esto todavía no ha entrado a cocina".

   Recorrido real:

     (comensal en línea / QR)      (mesero en el local / hub offline)
              │                                  │
            NEW  ── "Enviar a cocina" ──►      PREP  ← nace aquí:
                                                       la comanda ya
                                                       se imprimió
              PREP ── "Marcar listo" ──► READY
                                           ├── DINE_IN   → SERVED  → (mesa se libera) DELIVERED
                                           ├── DELIVERY  → TRANSIT → DELIVERED
                                           └── PICKUP    → DELIVERED
   ============================================================ */

import type { OrderStatus } from '@/types';

type ServiceType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW:       'Sin enviar a cocina',
  PREP:      'En cocina',
  READY:     'Listo',
  TRANSIT:   'En camino',
  SERVED:    'Servido',
  DELIVERED: 'Entregado',
  CANCEL:    'Anulado',
};

/** Versión corta para espacios estrechos (tarjeta del mesero). */
export const STATUS_LABEL_SHORT: Record<OrderStatus, string> = {
  NEW:       'Sin enviar',
  PREP:      'En cocina',
  READY:     'Listo',
  TRANSIT:   'En camino',
  SERVED:    'Servido',
  DELIVERED: 'Entregado',
  CANCEL:    'Anulado',
};

/** Clase de chip (ver .chip-* en globals.css) — legible en claro y en oscuro.
 *  El color es semántico, no decorativo: verde = hay que actuar YA (está
 *  listo y se enfría), ámbar = está cocinándose, azul = acaba de entrar,
 *  gris = ya no hay nada que hacer. */
export const STATUS_CHIP: Record<OrderStatus, string> = {
  NEW:       'chip-info',
  PREP:      'chip-warn',
  READY:     'chip-ok',
  TRANSIT:   'chip-alt',
  SERVED:    'chip-neutral',
  DELIVERED: 'chip-neutral',
  CANCEL:    'chip-danger',
};

/** DINE_IN nunca llega a DELIVERED por esta vía: READY→SERVED se detiene ahí,
 *  la mesa la cierra el mesero explícitamente ("Marcar como libre"). */
export function nextStatus(status: OrderStatus, type: ServiceType): OrderStatus | null {
  if (status === 'NEW')   return 'PREP';
  if (status === 'PREP')  return 'READY';
  if (status === 'READY') {
    if (type === 'DELIVERY') return 'TRANSIT';
    if (type === 'DINE_IN')  return 'SERVED';
    return 'DELIVERED';
  }
  if (status === 'TRANSIT') return 'DELIVERED';
  return null;
}

/** Texto del botón que avanza el pedido: dice lo que el botón HACE. */
export function nextLabel(status: OrderStatus, type: ServiceType): string {
  // "Enviar a cocina" en vez de "Confirmar": es literalmente lo que hace
  // (manda la comanda a la impresora de cocina y lo pone en el KDS).
  if (status === 'NEW')   return 'Enviar a cocina';
  if (status === 'PREP')  return 'Marcar listo';
  if (status === 'READY') {
    if (type === 'DELIVERY') return 'Salió a entregar';
    if (type === 'DINE_IN')  return 'Servido en mesa';
    return 'Entregado al cliente';
  }
  if (status === 'TRANSIT') return 'Entregado';
  return '';
}

/** Sin más botón de avance en la tarjeta. SERVED cuenta: cerrar una mesa
 *  DINE_IN es solo vía "Marcar como libre" en el panel de mesero. */
export function isCardTerminal(status: OrderStatus): boolean {
  return status === 'DELIVERED' || status === 'CANCEL' || status === 'SERVED';
}

/* ── Cronómetro por etapa ─────────────────────────────────────
   No importa "cuánto lleva el pedido" en abstracto, sino cuánto lleva EN LA
   ETAPA EN QUE ESTÁ: un pedido listo hace 12 minutos que nadie ha llevado a
   la mesa es un plato frío, aunque se haya cocinado rápido. */

export interface StageClock {
  since: string;
  /** Qué se está midiendo, en palabras. */
  label: string;
  yellowMin: number;
  redMin: number;
}

export function stageClock(
  order: { status: OrderStatus; created_at: string; accepted_at: string | null; ready_at: string | null },
  kitchenYellowMin: number,
  kitchenRedMin: number,
): StageClock | null {
  switch (order.status) {
    case 'NEW':
      // Aceptar un pedido es cuestión de segundos: si lleva minutos ahí, el
      // cliente está esperando sin que nadie haya empezado nada. Por eso los
      // umbrales son fijos y cortos, no los del tiempo de cocción.
      return { since: order.created_at, label: 'esperando', yellowMin: 2, redMin: 5 };
    case 'PREP':
      return {
        since: order.accepted_at ?? order.created_at,
        label: 'en cocina',
        yellowMin: kitchenYellowMin,
        redMin: kitchenRedMin,
      };
    case 'READY':
      return { since: order.ready_at ?? order.created_at, label: 'listo sin entregar', yellowMin: 5, redMin: 10 };
    case 'TRANSIT':
      return { since: order.ready_at ?? order.created_at, label: 'en camino', yellowMin: 20, redMin: 40 };
    default:
      return null;
  }
}

/** "8 min", "1 h 20 min", "3 días" — se lee de un vistazo desde lejos. */
export function fmtElapsed(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  if (h < 48) return `${h} h ${totalMin % 60} min`;
  return `${Math.floor(h / 24)} días`;
}

export function clockChipClass(elapsedMin: number, c: StageClock): string {
  if (elapsedMin >= c.redMin) return 'chip-danger';
  if (elapsedMin >= c.yellowMin) return 'chip-warn';
  return 'chip-neutral';
}
