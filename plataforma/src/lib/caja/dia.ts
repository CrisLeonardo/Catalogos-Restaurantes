/**
 * EL DÍA DE NEGOCIO
 * ------------------------------------------------------------
 * Migración 145 (PROD-04). Un bar que cierra a la 1:30 no cierra «el día
 * siguiente»: cierra el viernes, aunque el reloj ya diga sábado. Cada
 * restaurante tiene una hora de corte (`restaurants.day_cutoff_minutes`,
 * por omisión 05:00) y todo lo anterior a esa hora pertenece al día de
 * antes.
 *
 * Aquí vive la única forma de responder «¿de qué día es esto?». La usan la
 * caja, los gastos, las propinas, Hoy, Pedidos, Mesas, los reportes y la
 * analítica: si cada uno cortara el día a su manera, el cuadre de la noche
 * y el reporte de la mañana dirían dos totales distintos.
 *
 * Sin base de datos a propósito, para poder probarlo.
 */

/** 05:00 — lo que el dueño eligió el 2026-10-09. */
export const CORTE_POR_OMISION = 300;

/** El máximo razonable: un «día» que empieza después del mediodía ya no es un día. */
export const CORTE_MAXIMO = 720;

const MIN_MS = 60_000;
const DIA_MS = 24 * 60 * MIN_MS;

/** Lo guardado → minutos válidos. Basura o nulo = la hora por omisión. */
export function normalizarCorte(v: unknown): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || v === null || v === undefined || v === '') return CORTE_POR_OMISION;
  return Math.min(CORTE_MAXIMO, Math.max(0, n));
}

/** "05:00" → 300. Devuelve null si no es una hora válida dentro del rango. */
export function horaACorte(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const total = h * 60 + min;
  return total > CORTE_MAXIMO ? null : total;
}

/** 300 → "05:00". */
export function corteAHora(minutos: number): string {
  const n = normalizarCorte(minutos);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/** Fecha local YYYY-MM-DD de un instante en una zona. */
function fechaLocal(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return date.toLocaleDateString('en-CA');
  }
}

/**
 * A qué día de negocio pertenece un instante.
 *
 * Restar el corte al instante y mirar la fecha local es exacto mientras la
 * zona no cambie de hora entre el corte y la medianoche — Guatemala no
 * cambia nunca, y donde sí se cambia ocurre a las 2:00, dentro del margen.
 */
export function diaDeNegocio(date: Date, timezone: string, corteMin: number): string {
  return fechaLocal(new Date(date.getTime() - normalizarCorte(corteMin) * MIN_MS), timezone);
}

/** Instante UTC en que empieza la medianoche local de "YYYY-MM-DD". */
function medianocheLocal(dateKey: string, timezone: string): Date {
  const guess = new Date(`${dateKey}T00:00:00Z`);
  try {
    const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: timezone }));
    const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime()));
  } catch {
    return guess;
  }
}

/** Instante en que EMPIEZA un día de negocio: su medianoche local + el corte. */
export function inicioDelDia(dateKey: string, timezone: string, corteMin: number): Date {
  return new Date(medianocheLocal(dateKey, timezone).getTime() + normalizarCorte(corteMin) * MIN_MS);
}

/** Los bordes [desde, hasta) de un día de negocio. */
export function bordesDelDia(dateKey: string, timezone: string, corteMin: number): { desde: Date; hasta: Date } {
  const desde = inicioDelDia(dateKey, timezone, corteMin);
  return { desde, hasta: new Date(desde.getTime() + DIA_MS) };
}

/** Minutos transcurridos desde que empezó el día de negocio (0…1439). */
export function minutosDelDia(date: Date, timezone: string, corteMin: number): number {
  let hhmm: string;
  try {
    hhmm = date.toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit' });
  } catch {
    hhmm = `${date.getHours()}:${date.getMinutes()}`;
  }
  const [h, m] = hhmm.split(':').map(Number);
  const local = ((h % 24) * 60 + m);
  return (local - normalizarCorte(corteMin) + 1440) % 1440;
}

/** Suma días a una clave YYYY-MM-DD (aritmética de calendario, sin zona). */
export function sumarDias(dateKey: string, dias: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
