/* ============================================================
   HORARIOS DE APERTURA — tipos y lógica compartida
   ------------------------------------------------------------
   `restaurants.hours` (JSONB) guarda el horario semanal:
     { "0": [["08:00","21:00"]], "5": [["08:00","01:00"]], ... }
   Clave = día de la semana (0=domingo … 6=sábado, como Date.getDay()).
   · Día ausente o lista vacía  → cerrado ese día.
   · hours = null               → sin horario configurado (siempre abierto).
   · Cierre <= apertura         → el intervalo cruza la medianoche.
   Sin dependencias: se usa en server actions y componentes cliente.
   ============================================================ */

export type DayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/** [apertura, cierre] en formato "HH:MM" (24 h). */
export type HourInterval = [string, string];

export type WeeklyHours = Partial<Record<DayKey, HourInterval[]>>;

export const DAY_LABELS: Record<DayKey, string> = {
  '1': 'Lunes',
  '2': 'Martes',
  '3': 'Miércoles',
  '4': 'Jueves',
  '5': 'Viernes',
  '6': 'Sábado',
  '0': 'Domingo',
};

/** Orden de edición/visualización: lunes a domingo. */
export const DAY_ORDER: DayKey[] = ['1', '2', '3', '4', '5', '6', '0'];

/** "HH:MM" → minutos desde medianoche. NaN si el formato es inválido. */
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** Día de la semana y minutos locales de `now` EN la zona horaria dada. */
function localNowParts(timezone: string, now: Date): { day: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    // Algunos motores devuelven "24" para medianoche con hourCycle h24.
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    if (dayIdx === -1 || Number.isNaN(hour) || Number.isNaN(minute)) throw new Error('parts');
    return { day: dayIdx, minutes: hour * 60 + minute };
  } catch {
    // Zona horaria inválida → hora del servidor (mejor eso que romper el sitio).
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

/**
 * ¿Está abierto ahora según el horario semanal?
 * Revisa los intervalos de hoy y los de ayer que cruzan la medianoche.
 */
export function isOpenNow(
  hours: WeeklyHours | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!hours) return true; // sin horario configurado = siempre abierto
  const { day, minutes } = localNowParts(timezone, now);

  const today = hours[String(day) as DayKey] ?? [];
  for (const [open, close] of today) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (Number.isNaN(o) || Number.isNaN(c)) continue;
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return true;
  }

  // Intervalos de AYER que cruzan medianoche (p.ej. viernes 20:00–02:00).
  const yesterday = hours[String((day + 6) % 7) as DayKey] ?? [];
  for (const [open, close] of yesterday) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (Number.isNaN(o) || Number.isNaN(c)) continue;
    if (c <= o && minutes < c) return true;
  }

  return false;
}

/** ¿Tiene al menos un intervalo válido? (false = "sin horario configurado") */
export function hasAnyHours(hours: WeeklyHours | null | undefined): boolean {
  if (!hours) return false;
  return Object.values(hours).some((list) => (list?.length ?? 0) > 0);
}

/**
 * Fecha local "YYYY-MM-DD" de un instante en una zona horaria.
 * (en-CA formatea exactamente como ISO; se usa para agrupar KPIs por día.)
 */
export function localDateKey(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return date.toLocaleDateString('en-CA');
  }
}
