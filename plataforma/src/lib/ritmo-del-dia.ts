import type { DayPace } from '@/lib/db/orders';

/* ============================================================
   Cómo va el día frente a un día igual — cuándo SÍ decirlo
   ------------------------------------------------------------
   Hoy y «Cómo va el día» comparan lo vendido con lo que un día
   igual (mismo día de la semana, semanas anteriores) llevaba A
   ESTA HORA. La comparación es buena; el momento no lo era: a
   media mañana, antes de la primera venta, el panel abría el día
   con «↓ 100 % vs. un martes normal» en color de alerta. Cero no
   es «mal», es «todavía no» (auditoría de experiencia 2026-10-27,
   EV-15).

   La regla vive aquí, una sola, para que las dos pantallas digan
   lo mismo:
     · Sin días con qué comparar (menos de dos) → nada.
     · Sin ventas todavía → 'esperando': sin porcentaje, y con la
       meta del día (con cuánto cierra un día igual) en su lugar.
     · Con ventas → el porcentaje de siempre.
   ============================================================ */

export type RitmoDelDia =
  | { tipo: 'esperando'; cierreTipico: number }
  | { tipo: 'comparado'; delta: number; tipicoAEstaHora: number };

/** Días iguales mínimos para comparar: uno solo es casualidad. */
const MIN_MUESTRAS = 2;

export function ritmoDelDia(ventasHoy: number, pace: DayPace | null): RitmoDelDia | null {
  if (!pace || pace.samples < MIN_MUESTRAS) return null;
  if (ventasHoy <= 0) {
    return pace.typicalFullDay > 0 ? { tipo: 'esperando', cierreTipico: pace.typicalFullDay } : null;
  }
  if (pace.typicalSoFar <= 0) return null;
  return {
    tipo: 'comparado',
    delta: Math.round(((ventasHoy - pace.typicalSoFar) / pace.typicalSoFar) * 100),
    tipicoAEstaHora: pace.typicalSoFar,
  };
}
