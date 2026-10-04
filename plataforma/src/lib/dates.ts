/* ============================================================
   FECHAS Y «HACE CUÁNTO» — una sola manera de decirlo.
   ------------------------------------------------------------
   La auditoría 2026-10-02 (T-02) encontró siete copias de
   `timeAgo`, cada una con su regla: la de La PC del local no
   pasaba de horas y decía «Última conexión hace 2004 h» mientras
   otro bloque de la misma pantalla decía «hace 84 días». Y fechas
   crudas de la base a la vista del dueño: «Vence el 2026-09-01»,
   «Mensualidad 2026-09».
   ============================================================ */

const LOCALE = 'es-GT';
export const TZ_GT = 'America/Guatemala';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

function toMs(v: string | number | Date): number {
  return typeof v === 'number' ? v : typeof v === 'string' ? new Date(v).getTime() : v.getTime();
}

/** «2026-09-01» es una FECHA, no un instante: si se leyera como medianoche
 *  UTC, en Guatemala (UTC-6) se pintaría el 31 de agosto. */
function esFechaSola(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * «hace un momento», «hace 5 min», «hace 3 h», «ayer», «hace 4 días»;
 * pasado un mes, la fecha («12 sep 2026»), que a esa escala informa más
 * que un número de días.
 */
export function haceTiempo(desde: string | number | Date, ahora: number = Date.now()): string {
  const ms = Math.max(0, ahora - toMs(desde));
  if (ms < MIN) return 'hace un momento';
  if (ms < HORA) return `hace ${Math.floor(ms / MIN)} min`;
  if (ms < DIA) return `hace ${Math.floor(ms / HORA)} h`;
  if (ms < 2 * DIA) return 'ayer';
  if (ms < 31 * DIA) return `hace ${Math.floor(ms / DIA)} días`;
  return `el ${fechaCorta(new Date(toMs(desde)))}`;
}

/** «1 sept 2026». Acepta fecha sola («2026-09-01») o instante (ISO/Date). */
export function fechaCorta(v: string | Date, tz: string = TZ_GT): string {
  if (esFechaSola(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
    .format(typeof v === 'string' ? new Date(v) : v);
}

/** «2026-09» → «septiembre de 2026». */
export function mesYAnio(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}

/** Cambia cada «AAAA-MM» suelto de un texto por el mes con nombre:
 *  «Mensualidad 2026-09» → «Mensualidad septiembre de 2026». Para textos
 *  que ya vienen escritos de la base (conceptos de cobro). */
export function conMesesLegibles(texto: string): string {
  return texto.replace(/\b(\d{4}-\d{2})\b(?!-\d)/g, (ym) => mesYAnio(ym));
}

/** «2026-09-03» → «3 sept» (ejes de gráficas, listas del mismo año). */
export function diaMes(v: string | Date, tz: string = TZ_GT): string {
  if (esFechaSola(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: tz })
    .format(typeof v === 'string' ? new Date(v) : v);
}

/** «lun 28 sept» — el día de una barra de gráfica (fecha sola «2026-09-28»). */
export function diaSemana(ymd: string): string {
  if (!esFechaSola(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(',', '');
}

/** ¿El instante cae HOY en la zona dada? (para decir solo la hora de lo de hoy). */
export function esHoy(v: string | Date, tz: string = TZ_GT, ahora: Date = new Date()): boolean {
  const dia = (d: Date) => {
    try { return d.toLocaleDateString('en-CA', { timeZone: tz }); }
    catch { return d.toLocaleDateString('en-CA', { timeZone: TZ_GT }); }
  };
  return dia(typeof v === 'string' ? new Date(v) : v) === dia(ahora);
}
