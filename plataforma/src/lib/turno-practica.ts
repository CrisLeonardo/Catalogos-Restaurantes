/* ============================================================
   TURNO DE PRÁCTICA (ficha 2.5 de la auditoría, A05)
   ------------------------------------------------------------
   Cinco minutos para atender una mesa completa con la carta real y
   sin que nada cuente. Todo pasa en la memoria del aparato: la «Mesa P»
   no existe en el salón, la comanda no sale a cocina ni a la impresora,
   el cobro no toca la caja y la anulación no pide PIN. Al salir, se
   olvida. Lo único que se guarda es que la persona la terminó (bitácora
   de Personal: «hizo el turno de práctica»).

   Aquí vive solo la lógica pura: qué paso toca según lo que ya se hizo.
   La pantalla está en `components/admin/servicio/turno-practica.tsx`.
   ============================================================ */

import type { Product } from '@/types';

/** Lo que ya pasó en la mesa de práctica. */
export interface EstadoPractica {
  /** Se abrió la Mesa P. */
  abierta: boolean;
  /** Hay algo apuntado sin enviar. */
  apuntado: boolean;
  /** Lo apuntado lleva un extra o una opción (si la carta tiene alguno). */
  conExtra: boolean;
  /** Se mandó a cocina. */
  enviado: boolean;
  /** Cocina lo marcó listo. */
  listo: boolean;
  /** Se anuló un plato. */
  corregido: boolean;
  /** Se cobró. */
  cobrado: boolean;
}

export const ESTADO_INICIAL: EstadoPractica = {
  abierta: false, apuntado: false, conExtra: false, enviado: false,
  listo: false, corregido: false, cobrado: false,
};

export const TOTAL_PASOS = 6;

/**
 * El paso en el que va (1–6), o 7 cuando terminó.
 *
 * El orden es el del turno real: abrir, pedir, enviar, que cocina lo
 * tenga listo, corregir y cobrar. La maqueta ponía «corregir» al final,
 * pero en un turno de verdad un plato no se anula después de cobrarlo:
 * se anula antes, con la mesa abierta.
 */
export function pasoActual(e: EstadoPractica, hayExtras: boolean): number {
  if (!e.abierta) return 1;
  if (!e.enviado) return (e.apuntado && (e.conExtra || !hayExtras)) ? 3 : 2;
  if (!e.listo) return 4;
  if (!e.corregido) return 5;
  if (!e.cobrado) return 6;
  return 7;
}

/** El plato que se propone para el paso 2: el primero con algo que elegir. */
export function platoSugerido(products: Product[], personalizable: (p: Product) => boolean): Product | null {
  const vivos = products.filter((p) => p.is_active && p.is_available);
  return vivos.find(personalizable) ?? null;
}

/** «Lo hiciste en 4 minutos», contando desde que se abrió la mesa. */
export function minutosDePractica(desde: number, hasta: number): number {
  return Math.max(1, Math.round((hasta - desde) / 60_000));
}
