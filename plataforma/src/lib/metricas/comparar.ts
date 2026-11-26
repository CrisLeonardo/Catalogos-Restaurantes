/* ============================================================
   COMPARAR CON POCO HISTORIAL (METRICAS-01, auditoría 2026-11-25)
   ------------------------------------------------------------
   Un restaurante nuevo con dos visitas leía «Un día normal recibe 0
   visitas. Hoy vas 600 % arriba»: el día típico era 0.29 y se
   redondeaba a 0, pero el porcentaje se calculaba contra 0.29. Con
   tan poca base un porcentaje no dice nada y asusta o engaña.

   Regla: el porcentaje solo aparece cuando el día típico tiene al
   menos MIN_BASE visitas. Por debajo se dan los conteos, que sí se
   entienden («Hoy van 2 visitas; todavía hay poco historial»).
   ============================================================ */

export const MIN_BASE = 5;

export type ComparacionVisitas =
  | { tipo: 'porcentaje'; tipico: number; delta: number }
  | { tipo: 'conteo'; hoy: number }
  | null;

export function compararVisitas(hoy: number, tipico: number): ComparacionVisitas {
  const base = Math.round(tipico);
  if (base < MIN_BASE) return hoy > 0 ? { tipo: 'conteo', hoy } : null;
  const delta = Math.round(((hoy - base) / base) * 100);
  return Math.abs(delta) >= 5 ? { tipo: 'porcentaje', tipico: base, delta } : null;
}

/** «2 pedidos», «1 pedido»: el número de observaciones detrás de un «se llena». */
export function observaciones(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
