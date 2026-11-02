/* ============================================================
   EL TOPE DE PEDIDOS DEL PLAN EN LÍNEA (2026-11-02)
   ------------------------------------------------------------
   Sin encargos, un Estándar con «para llevar + a domicilio» era casi
   En línea con finanzas y un usuario más. El dueño eligió separarlos
   por TAMAÑO: En línea es para empezar (hasta 300 pedidos al mes, unos
   10 al día) y, cuando el negocio crece, se sube.

   Es un tope BLANDO, a propósito: nunca se corta un pedido. Un menú que
   deja de vender a media tarde del día 28 le quita dinero al restaurante
   y la confianza en Leogin; aquí solo se avisa (al 80 % y al pasarlo) y
   se pide subir el mes siguiente. Mismo criterio que el aviso de visitas
   del plan gratuito.

   El mes es el del calendario en la zona del restaurante, y cuentan los
   pedidos que no se cancelaron.
   ============================================================ */

import { PLANS, type PlanCode } from '@/lib/plans';

/** A partir de qué parte del tope se empieza a avisar. */
export const AVISO_TOPE = 0.8;

export type NivelTope = 'ok' | 'cerca' | 'pasado';

export interface EstadoTope {
  tope: number;
  usados: number;
  /** Lo que queda antes del tope (0 si ya se pasó). */
  restantes: number;
  nivel: NivelTope;
  /** 0..1, para una barra (topado en 1). */
  fraccion: number;
}

/** El estado del tope de un plan con `usados` pedidos este mes; null si el plan no tiene tope. */
export function estadoDelTope(plan: PlanCode | null | undefined, usados: number): EstadoTope | null {
  const tope = plan ? PLANS[plan]?.monthlyOrderCap : undefined;
  if (!tope) return null;
  const n = Math.max(0, Math.floor(usados));
  const nivel: NivelTope = n > tope ? 'pasado' : n >= Math.ceil(tope * AVISO_TOPE) ? 'cerca' : 'ok';
  return { tope, usados: n, restantes: Math.max(0, tope - n), nivel, fraccion: Math.min(1, n / tope) };
}

/** «2026-11-02» → «2026-11-01»: el primer día del mes de una fecha local. */
export function primerDiaDelMes(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}
