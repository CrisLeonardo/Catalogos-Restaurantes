import type { IconName } from '@/components/icons';
import type { TableReason } from '@/lib/table-state';

/**
 * El icono de cada motivo por el que una mesa pide atención.
 *
 * Vive aparte porque lo comparten el riel del teléfono, el panel "Te
 * necesitan ahora" de la tablet y el tablero de salón del dueño: si
 * cada uno eligiera el suyo, la misma mesa se vería con tres iconos
 * distintos según desde dónde se mire.
 *
 * El icono nunca va solo — siempre lleva su frase al lado (ver
 * `state.label`). Es una ayuda para encontrar la fila de un vistazo,
 * no la forma de saber qué pasa.
 */
export const REASON_ICON: Record<TableReason, IconName> = {
  cuenta: 'wallet',
  lista: 'clock',
  llamada: 'bell',
  'sin-aceptar': 'alertCircle',
  'sin-cobrar': 'receipt',
  abandonada: 'clock',
};
