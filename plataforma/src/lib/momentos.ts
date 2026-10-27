/* ============================================================
   MOMENTOS PICO — lo que se celebra y cuándo es verdad
   ------------------------------------------------------------
   docs/planes/PLAN_MOMENTOS_PICO_2026-10-26.md (P3, P4, P5, P6).

   La regla de oro de la estrategia (§2): persuadir sí, engañar no. Un
   «tu mejor martes del mes» que no lo es se nota el primer día y quema la
   confianza para siempre. Por eso cada celebración exige datos suficientes:
   sin historia con qué comparar, no se dice nada.

   Sin base de datos a propósito, para poder probarlo
   (lib/momentos.test.ts). Las consultas viven en lib/db/momentos.ts.
   ============================================================ */

import { sumarDias } from '@/lib/caja/dia';

export interface RecordDelDia {
  tipo: 'mes' | 'dia-semana';
  texto: string;
}

/** Días con venta que hacen falta para hablar de «el mejor del mes». */
const MIN_DIAS_MES = 7;
/** Días iguales (los martes pasados) que hacen falta para comparar. */
const MIN_DIAS_IGUALES = 2;

/**
 * ¿Hoy ya es un récord? `ventas` es día de negocio (YYYY-MM-DD) → total
 * vendido; `hoy` es la clave de hoy y `nombreDia` el día de la semana en
 * minúsculas («martes»).
 *
 * - «Tu mejor día del mes»: hoy supera a TODOS los 30 días anteriores, y
 *   al menos 7 de ellos tuvieron venta.
 * - «Tu mejor martes del mes»: hoy supera a los cuatro martes anteriores,
 *   y al menos 2 de ellos tuvieron venta.
 *
 * Un día a medias que ya pasó a todos los anteriores ES un récord: lo que
 * falta del día solo puede subirlo.
 */
export function recordDelDia(ventas: Map<string, number>, hoy: string, nombreDia: string): RecordDelDia | null {
  const deHoy = ventas.get(hoy) ?? 0;
  if (!(deHoy > 0)) return null;

  const anteriores: number[] = [];
  for (let i = 1; i <= 30; i++) anteriores.push(ventas.get(sumarDias(hoy, -i)) ?? 0);
  const conVenta = anteriores.filter((v) => v > 0).length;
  if (conVenta >= MIN_DIAS_MES && deHoy > Math.max(...anteriores)) {
    return { tipo: 'mes', texto: 'Tu mejor día del mes' };
  }

  const iguales = [7, 14, 21, 28]
    .map((d) => ventas.get(sumarDias(hoy, -d)) ?? 0)
    .filter((v) => v > 0);
  if (iguales.length >= MIN_DIAS_IGUALES && deHoy > Math.max(...iguales)) {
    return { tipo: 'dia-semana', texto: `Tu mejor ${nombreDia} del mes` };
  }
  return null;
}

/** 13 → «1 p. m.», 0 → «12 a. m.» (como se dice en Guatemala). */
export function etiquetaHora(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const doce = hh % 12 === 0 ? 12 : hh % 12;
  return `${doce} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
}

export interface HoraPico {
  /** Hora local en que empieza la franja (0…23). */
  hora: number;
  pedidos: number;
  texto: string;
}

/**
 * La hora con más pedidos de hoy. `horas` es la hora local (0…23) de cada
 * pedido. Con menos de 3 pedidos en el día no hay «hora pico», y tampoco si
 * ninguna franja junta al menos 2.
 */
export function horaPico(horas: number[]): HoraPico | null {
  if (horas.length < 3) return null;
  const cuenta = new Map<number, number>();
  for (const h of horas) cuenta.set(h, (cuenta.get(h) ?? 0) + 1);
  let mejor: [number, number] | null = null;
  for (const par of cuenta) {
    // En empate gana la más temprana: la que el dueño ya vivió primero.
    if (!mejor || par[1] > mejor[1] || (par[1] === mejor[1] && par[0] < mejor[0])) mejor = par;
  }
  if (!mejor || mejor[1] < 2) return null;
  const [hora, pedidos] = mejor;
  const desde = etiquetaHora(hora);
  const hasta = etiquetaHora(hora + 1);
  // «De 1 a 2 p. m.»: si las dos llevan el mismo «p. m.», se dice una vez.
  const mismoTramo = desde.slice(-5) === hasta.slice(-5);
  const texto = mismoTramo ? `De ${desde.slice(0, -6)} a ${hasta}` : `De ${desde} a ${hasta}`;
  return { hora, pedidos, texto };
}

/** Los pedidos que se celebran. Después de 100, cada uno vale más que el anterior. */
export const HITOS_DE_PEDIDOS = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000] as const;

export interface Hito {
  /** Clave estable para recordar que ya se vio (localStorage). */
  clave: string;
  titulo: string;
  texto: string;
}

const miles = (n: number) => n.toLocaleString('es-GT');

/**
 * El hito más reciente que ya se alcanzó, o null. `pedidos` cuenta los
 * pedidos que no se cancelaron; `diasDesdeAlta`, los días desde que se creó
 * el restaurante en Leogin.
 *
 * Los pedidos van primero: son lo que el dueño hizo. El tiempo (primer mes,
 * cada año) solo se celebra en su ventana —del día 30 al 44, o las dos
 * semanas después de cumplir años— para que no salga meses tarde.
 */
export function hitoAlcanzado(pedidos: number, diasDesdeAlta: number): Hito | null {
  const dePedidos = [...HITOS_DE_PEDIDOS].reverse().find((h) => pedidos >= h);
  if (dePedidos) {
    return {
      clave: `pedidos-${dePedidos}`,
      titulo: `¡${miles(dePedidos)} pedidos!`,
      texto: dePedidos === 100
        ? 'Cien pedidos que ya no se perdieron en un papelito. Esto apenas empieza.'
        : `Llevas ${miles(pedidos)} pedidos con Leogin. Cada uno, anotado y cobrado.`,
    };
  }
  if (diasDesdeAlta >= 30 && diasDesdeAlta < 45) {
    return {
      clave: 'primer-mes',
      titulo: 'Tu primer mes con Leogin',
      texto: 'Un mes con tu restaurante bajo control. Gracias por confiar en nosotros.',
    };
  }
  const anios = Math.floor(diasDesdeAlta / 365);
  if (anios >= 1 && diasDesdeAlta - anios * 365 < 14) {
    return {
      clave: `aniversario-${anios}`,
      titulo: anios === 1 ? '¡Un año con Leogin!' : `¡${anios} años con Leogin!`,
      texto: 'Mira cómo te fue en «Tu año con Leogin».',
    };
  }
  return null;
}
