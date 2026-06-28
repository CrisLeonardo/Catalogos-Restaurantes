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

/** Etiqueta corta del día ("Lun", "Mar"…) para resúmenes compactos. */
export const DAY_SHORT: Record<DayKey, string> = {
  '1': 'Lun',
  '2': 'Mar',
  '3': 'Mié',
  '4': 'Jue',
  '5': 'Vie',
  '6': 'Sáb',
  '0': 'Dom',
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

/**
 * Texto amable de la PRÓXIMA apertura ("hoy a las 18:00", "mañana a las 08:00",
 * "el Lunes a las 08:00") o null si no se puede determinar. Útil para avisar al
 * comensal cuándo vuelve a abrir cuando el restaurante está cerrado ahora.
 */
export function nextOpenLabel(
  hours: WeeklyHours | null | undefined,
  timezone: string,
  now: Date = new Date(),
): string | null {
  if (!hours) return null;
  const { day, minutes } = localNowParts(timezone, now);

  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const list = hours[String(d) as DayKey] ?? [];
    let bestOpen = Infinity;
    for (const [open] of list) {
      const o = toMinutes(open);
      if (Number.isNaN(o)) continue;
      // Hoy: solo aperturas que aún no pasaron.
      if (offset === 0 && o <= minutes) continue;
      if (o < bestOpen) bestOpen = o;
    }
    if (bestOpen !== Infinity) {
      const hh = String(Math.floor(bestOpen / 60)).padStart(2, '0');
      const mm = String(bestOpen % 60).padStart(2, '0');
      const time = `${hh}:${mm}`;
      if (offset === 0) return `hoy a las ${time}`;
      if (offset === 1) return `mañana a las ${time}`;
      return `el ${DAY_LABELS[String(d) as DayKey]} a las ${time}`;
    }
  }
  return null;
}

/** ¿Tiene al menos un intervalo válido? (false = "sin horario configurado") */
export function hasAnyHours(hours: WeeklyHours | null | undefined): boolean {
  if (!hours) return false;
  return Object.values(hours).some((list) => (list?.length ?? 0) > 0);
}

/* ============================================================
   ETIQUETAS LEGIBLES — para menús por franja (categorías) y
   resúmenes de horario en el panel y en el menú del comensal.
   ============================================================ */

/** "07:00" → "7:00" (quita el cero a la izquierda de la hora). */
export function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!m) return hhmm ?? '';
  return `${Number(m[1])}:${m[2]}`;
}

/** Intervalos de un día como texto: "7:00–11:00" o "7:00–10:00, 13:00–16:00". */
function intervalsLabel(list: HourInterval[]): string {
  return list
    .filter(([o, c]) => !Number.isNaN(toMinutes(o)) && !Number.isNaN(toMinutes(c)))
    .map(([o, c]) => `${fmtTime(o)}–${fmtTime(c)}`)
    .join(', ');
}

/** Intervalos válidos de HOY según la zona horaria, o null si hoy no aplica. */
export function todayWindowLabel(
  hours: WeeklyHours | null | undefined,
  timezone: string,
  now: Date = new Date(),
): string | null {
  if (!hours) return null;
  const { day } = localNowParts(timezone, now);
  const list = hours[String(day) as DayKey] ?? [];
  if (list.length === 0) return null;
  const label = intervalsLabel(list);
  return label || null;
}

/**
 * Resumen semanal compacto y legible del horario, agrupando días
 * consecutivos con la misma franja. Ejemplos:
 *   "Todos los días · 7:00–11:00"
 *   "Lun a Vie · 7:00–11:00 · Sáb y Dom · 8:00–12:00"
 * Devuelve null si no hay ningún intervalo configurado.
 */
export function scheduleSummary(hours: WeeklyHours | null | undefined): string | null {
  if (!hasAnyHours(hours)) return null;

  // Firma por día (para detectar días con horario idéntico).
  const sigOf = (d: DayKey): string => {
    const list = hours![d];
    if (!list || list.length === 0) return '';
    return list.map(([o, c]) => `${o}-${c}`).join('|');
  };

  // Recorre Lun→Dom acumulando rachas de días contiguos con la misma franja.
  const runs: { days: DayKey[]; list: HourInterval[] }[] = [];
  for (let i = 0; i < DAY_ORDER.length; i++) {
    const d = DAY_ORDER[i];
    const sig = sigOf(d);
    if (!sig) continue;
    const last = runs[runs.length - 1];
    const prevDay = i > 0 ? DAY_ORDER[i - 1] : null;
    const contiguous = !!last && last.days[last.days.length - 1] === prevDay && sigOf(last.days[0]) === sig;
    if (contiguous) last.days.push(d);
    else runs.push({ days: [d], list: hours![d]! });
  }
  if (runs.length === 0) return null;

  const activeDays = runs.reduce((n, r) => n + r.days.length, 0);
  const daysLabel = (days: DayKey[]): string => {
    if (days.length === 1) return DAY_SHORT[days[0]];
    if (days.length === 2) return `${DAY_SHORT[days[0]]} y ${DAY_SHORT[days[1]]}`;
    return `${DAY_SHORT[days[0]]} a ${DAY_SHORT[days[days.length - 1]]}`;
  };

  return runs
    .map((r) => {
      const win = intervalsLabel(r.list);
      // Si están los 7 días en una sola racha → "Todos los días".
      const dl = runs.length === 1 && activeDays === 7 ? 'Todos los días' : daysLabel(r.days);
      return `${dl} · ${win}`;
    })
    .join(' · ');
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
