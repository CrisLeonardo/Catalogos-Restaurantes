/**
 * VIGENCIA DE UN CUPÓN
 * ------------------------------------------------------------
 * Auditoría 2026-11-03, ficha 0.5 (X04, X05). Aquí vive la única forma de
 * responder dos preguntas, para el panel y para el checkout por igual:
 *
 *  · ¿En qué estado está este cupón? Antes el panel tenía su propia cuenta,
 *    que no miraba `valid_from`: un cupón programado salía «Activo» mientras
 *    el checkout lo rechazaba.
 *
 *  · ¿Qué instante es «válido hasta el 10 de noviembre»? El formulario
 *    mandaba la fecha suelta ('2026-11-10') a una columna `timestamptz`, y
 *    Postgres la guardaba como medianoche UTC: en Guatemala el cupón dejaba
 *    de valer a las 18:00 del día ANTERIOR, y la lista mostraba ese día
 *    anterior como fecha de vencimiento.
 *
 * Contrato: las fechas son días del calendario EN LA ZONA DEL RESTAURANTE y
 * las dos son inclusivas. «Desde el 5» empieza a las 00:00 del 5; «hasta el
 * 10» vale todo el 10 y se guarda como el límite exclusivo de las 00:00 del
 * 11. Es medianoche de calendario, no el corte del día de negocio: es lo que
 * entiende el comensal que lee «válido hasta el 10».
 *
 * Sin base de datos a propósito, para poder probarlo.
 */

import { inicioDelDia } from '@/lib/caja/dia';

const DIA_MS = 24 * 60 * 60_000;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export type EstadoCupon = 'pausado' | 'programado' | 'vencido' | 'agotado' | 'vigente';

export const NOMBRE_ESTADO: Record<EstadoCupon, string> = {
  pausado: 'Pausado',
  programado: 'Programado',
  vencido: 'Vencido',
  agotado: 'Agotado',
  vigente: 'Activo',
};

export interface CuponVigencia {
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses: number;
}

/** Estado del cupón en un instante. Pausado gana: es lo que el dueño decidió. */
export function estadoDelCupon(c: CuponVigencia, ahora: number = Date.now()): EstadoCupon {
  if (!c.is_active) return 'pausado';
  if (c.valid_until && ahora >= new Date(c.valid_until).getTime()) return 'vencido';
  if (c.valid_from && ahora < new Date(c.valid_from).getTime()) return 'programado';
  if (c.max_uses != null && c.uses >= c.max_uses) return 'agotado';
  return 'vigente';
}

/** ¿Es "AAAA-MM-DD" una fecha del calendario que existe? */
export function esFecha(v: unknown): v is string {
  if (typeof v !== 'string' || !FECHA_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "Desde el 5" → instante en que empieza el 5 en la zona del local. */
export function inicioDeFecha(fecha: string, timezone: string): string {
  return inicioDelDia(fecha, timezone, 0).toISOString();
}

/** "Hasta el 10" → instante en que empieza el 11 en la zona del local (exclusivo). */
export function finDeFecha(fecha: string, timezone: string): string {
  const siguiente = new Date(new Date(`${fecha}T12:00:00Z`).getTime() + DIA_MS).toISOString().slice(0, 10);
  return inicioDelDia(siguiente, timezone, 0).toISOString();
}

function fechaLocal(instante: number, timezone: string): string {
  const d = new Date(instante);
  try {
    return d.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return d.toLocaleDateString('en-CA');
  }
}

/** Lo guardado en `valid_from` → el día que se eligió. */
export function fechaDeInicio(iso: string, timezone: string): string {
  return fechaLocal(new Date(iso).getTime(), timezone);
}

/** Lo guardado en `valid_until` (exclusivo) → el último día en que vale. */
export function fechaDeFin(iso: string, timezone: string): string {
  return fechaLocal(new Date(iso).getTime() - 1, timezone);
}

/** "2026-11-10" → "10 nov 2026", sin depender de la zona del aparato. */
export function fechaLegible(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-GT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

type Columnas = { valid_from: string | null; valid_until: string | null };

/**
 * Al editar, un día que no cambió conserva el instante que ya estaba
 * guardado: cambiar la descripción de un cupón no debe mover su vigencia
 * ni un minuto (auditoría 2026-11-03, X04).
 */
export function conservarSiNoCambio(nuevas: Columnas, previas: Columnas, timezone: string): Columnas {
  const mismoInicio = nuevas.valid_from != null && previas.valid_from != null
    && fechaDeInicio(nuevas.valid_from, timezone) === fechaDeInicio(previas.valid_from, timezone);
  const mismoFin = nuevas.valid_until != null && previas.valid_until != null
    && fechaDeFin(nuevas.valid_until, timezone) === fechaDeFin(previas.valid_until, timezone);
  return {
    valid_from: mismoInicio ? previas.valid_from : nuevas.valid_from,
    valid_until: mismoFin ? previas.valid_until : nuevas.valid_until,
  };
}

/**
 * Las dos fechas del formulario → columnas, ya validadas. `null` en una
 * fecha = sin límite por ese lado. Devuelve un error legible si no cuadran.
 */
export function vigenciaDesdeFormulario(
  desde: string | null,
  hasta: string | null,
  timezone: string,
): { valid_from: string | null; valid_until: string | null } | { error: string } {
  if (desde != null && !esFecha(desde)) return { error: 'La fecha de inicio no es válida.' };
  if (hasta != null && !esFecha(hasta)) return { error: 'La fecha de vencimiento no es válida.' };
  if (desde != null && hasta != null && hasta < desde) {
    return { error: 'El cupón no puede vencer antes de empezar.' };
  }
  return {
    valid_from: desde != null ? inicioDeFecha(desde, timezone) : null,
    valid_until: hasta != null ? finDeFecha(hasta, timezone) : null,
  };
}
