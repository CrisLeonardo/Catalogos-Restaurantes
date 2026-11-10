/**
 * COSTO DESCONOCIDO NO ES COSTO CERO
 * ------------------------------------------------------------
 * Auditoría 2026-11-03, ficha 0.3 (X21, PA-T17). Mi cuenta › Finanzas, su
 * PDF y su Excel decían «Costo Q0 · Utilidad Q0 · margen 0 %» cuando
 * ningún platillo tenía costo cargado: un dato que falta presentado como
 * resultado. Esta es la única regla para las tres salidas.
 *
 * Sin dependencias: la usan la página (servidor) y la exportación (cliente).
 */

export interface CifrasConCosto {
  /** Ingreso de platillos (sin envío ni propina). */
  productRevenue: number;
  /** Ingreso de los platillos que SÍ tienen costo. */
  costedRevenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
}

export type Cobertura =
  /** No se vendió ningún platillo: no hay nada que costear. */
  | { tipo: 'sin-ventas' }
  /** Se vendió, pero ningún platillo tiene costo: costo y utilidad no se conocen. */
  | { tipo: 'sin-costos' }
  /** Algunos platillos tienen costo: la utilidad es de esa parte. */
  | { tipo: 'parcial'; pct: number }
  | { tipo: 'completa' };

/** Por debajo de esto la cifra se marca como parcial (igual que Finanzas del panel). */
const UMBRAL_COMPLETA = 0.95;

export function coberturaDeCostos(c: Pick<CifrasConCosto, 'productRevenue' | 'costedRevenue'>): Cobertura {
  if (!(c.productRevenue > 0)) return { tipo: 'sin-ventas' };
  if (!(c.costedRevenue > 0)) return { tipo: 'sin-costos' };
  if (c.costedRevenue < c.productRevenue * UMBRAL_COMPLETA) {
    return { tipo: 'parcial', pct: Math.round((c.costedRevenue / c.productRevenue) * 100) };
  }
  return { tipo: 'completa' };
}

/** Costo, utilidad y margen para mostrar o exportar: null = no se conoce. */
export function cifrasDeCosto(c: CifrasConCosto): { costo: number | null; utilidad: number | null; margen: number | null } {
  if (coberturaDeCostos(c).tipo === 'sin-costos') return { costo: null, utilidad: null, margen: null };
  return { costo: c.cost, utilidad: c.profit, margen: c.marginPct };
}
