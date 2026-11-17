/* ============================================================
   AJUSTES QUE DICEN CÓMO ESTÁS (ficha 2.8: R24–R29, PA-T02, PA-T03)
   ------------------------------------------------------------
   Reglas puras, sin red, para que Ajustes y sus pantallas digan lo
   mismo: el estado de cada fila, las próximas aperturas, los turnos
   que se pisan y lo que no se puede guardar.
   ============================================================ */

import { DAY_ORDER, fmtTime, isOpenNow, localDateKey, type DayKey, type HourExceptions, type HourInterval, type WeeklyHours } from '@/lib/hours';

export type Tono = 'warn' | undefined;
export interface EstadoFila { texto: string; tono?: Tono }

const min = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

const franja = (list: HourInterval[]) => list.map(([o, c]) => `${fmtTime(o)} – ${fmtTime(c)}`).join(' · ');

/* ── Horario ──────────────────────────────────────────────── */

/** Día de la semana local (0 = domingo) de un instante. */
function diaLocal(fecha: Date, zona: string): DayKey {
  const corto = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zona }).format(fecha);
  return String(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(corto)) as DayKey;
}

export interface Apertura {
  /** «Hoy», «Mañana · 24 dic», «Jueves · 26 dic». */
  dia: string;
  texto: string;
  /** Cerrado ese día (por horario o por excepción). */
  cerrado: boolean;
  /** Viene de un feriado o fecha especial. */
  especial: boolean;
}

/**
 * Las próximas `n` fechas tal como las verá el cliente (PA-T03): la
 * excepción de una fecha manda sobre el horario semanal.
 */
export function proximasAperturas(
  hours: WeeklyHours | null, exceptions: HourExceptions | null, zona: string, ahora: Date = new Date(), n = 3,
): Apertura[] {
  const out: Apertura[] = [];
  for (let i = 0; i < n; i++) {
    const fecha = new Date(ahora.getTime() + i * 86_400_000);
    const clave = localDateKey(fecha, zona);
    const corta = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', timeZone: zona }).format(fecha);
    const nombre = new Intl.DateTimeFormat('es-GT', { weekday: 'long', timeZone: zona }).format(fecha);
    const dia = i === 0 ? 'Hoy' : i === 1 ? `Mañana · ${corta}` : `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} · ${corta}`;
    const excepcion = exceptions?.[clave];
    if (excepcion) {
      out.push(excepcion.length
        ? { dia, texto: `${franja(excepcion)} (fecha especial)`, cerrado: false, especial: true }
        : { dia, texto: 'Cerrado (fecha especial)', cerrado: true, especial: true });
      continue;
    }
    if (!hours) { out.push({ dia, texto: 'A toda hora', cerrado: false, especial: false }); continue; }
    const list = hours[diaLocal(fecha, zona)] ?? [];
    out.push(list.length
      ? { dia, texto: franja(list), cerrado: false, especial: false }
      : { dia, texto: 'Cerrado', cerrado: true, especial: false });
  }
  return out;
}

/** Lo que dice la fila de Horarios en Ajustes. */
export function estadoHorario(
  hours: WeeklyHours | null, exceptions: HourExceptions | null, zona: string, ahora: Date = new Date(),
): EstadoFila {
  /* Semana vacía = abierto siempre (PA-T02). Ya no se dice «Sin horario»:
     el dueño creía que no había configurado nada. */
  if (!hours && !exceptions?.[localDateKey(ahora, zona)]) return { texto: 'A toda hora', tono: 'warn' };
  const hoy = proximasAperturas(hours, exceptions, zona, ahora, 1)[0];
  if (isOpenNow(hours, zona, ahora, exceptions)) return { texto: `Abierto hoy · ${hoy.texto.replace(' (fecha especial)', '')}` };
  return { texto: hoy.cerrado ? 'Cerrado hoy' : `Hoy ${hoy.texto.replace(' (fecha especial)', '')}` };
}

/**
 * Turnos de un mismo día que se pisan (PA-T03). Un turno que cruza la
 * medianoche (20:00–02:00) cuenta hasta las 24:00 de ese día; lo que sigue
 * es del día siguiente y no choca aquí.
 */
export function turnosQueSePisan(list: HourInterval[]): [HourInterval, HourInterval] | null {
  const rangos = list
    .map((t) => ({ t, o: min(t[0]), c: min(t[1]) }))
    .filter((r) => !Number.isNaN(r.o) && !Number.isNaN(r.c))
    .map((r) => ({ ...r, c: r.c <= r.o ? 24 * 60 : r.c }))
    .sort((a, b) => a.o - b.o);
  for (let i = 1; i < rangos.length; i++) {
    if (rangos[i].o < rangos[i - 1].c) return [rangos[i - 1].t, rangos[i].t];
  }
  return null;
}

/** El primer día de la semana con turnos que se pisan, para el aviso. */
export function primerSolape(hours: WeeklyHours | null): { dia: DayKey; turnos: [HourInterval, HourInterval] } | null {
  if (!hours) return null;
  for (const d of DAY_ORDER) {
    const s = turnosQueSePisan(hours[d] ?? []);
    if (s) return { dia: d, turnos: s };
  }
  return null;
}

/* ── Entrega ──────────────────────────────────────────────── */

export type ModoEntrega = 'zonas' | 'distancia' | 'ambos' | 'cualquiera';

export function modoEntrega(zonas: number, radioKm: number | null, conUbicacion: boolean): ModoEntrega {
  const radio = radioKm != null && conUbicacion;
  if (zonas > 0 && radio) return 'ambos';
  if (zonas > 0) return 'zonas';
  if (radio) return 'distancia';
  return 'cualquiera';
}

const km = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

export function estadoEntrega(zonas: number, radioKm: number | null, conUbicacion: boolean): EstadoFila {
  switch (modoEntrega(zonas, radioKm, conUbicacion)) {
    case 'ambos': return { texto: `${zonas} ${zonas === 1 ? 'zona' : 'zonas'} · hasta ${km(radioKm!)} km` };
    case 'zonas': return { texto: `${zonas} ${zonas === 1 ? 'zona' : 'zonas'}` };
    case 'distancia': return { texto: `Hasta ${km(radioKm!)} km` };
    default: return { texto: 'A cualquier dirección', tono: 'warn' };
  }
}

/** Distancia en km entre dos puntos (Haversine, la misma fórmula del servidor). */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** «Prueba una dirección»: en la frontera exacta cuenta como dentro. */
export function pruebaDeDistancia(local: [number, number], punto: [number, number], radioKm: number): { dentro: boolean; km: number } {
  const d = Math.round(distanciaKm(local, punto) * 10) / 10;
  return { dentro: d <= radioKm, km: d };
}

/* ── Pedidos y cobro ──────────────────────────────────────── */

export function estadoPedidos(autoConfirm: boolean, minutos: number): EstadoFila {
  return { texto: autoConfirm ? `Confirma solo en ${minutos} min` : 'Confirmas tú' };
}

export interface TiemposDeServicio {
  kdsYellowMin: number;
  kdsRedMin: number;
  autoConfirmMinutes: number;
  salonReadyMin: number;
  salonUnpaidMin: number;
  salonUnacceptedMin: number;
}

/**
 * Lo que no se puede guardar (R29.3). Devuelve el primer problema en
 * palabras, o null. Lo usan la pantalla y el servidor.
 */
export function problemaDeTiempos(t: TiemposDeServicio): string | null {
  const enteros = [t.kdsYellowMin, t.kdsRedMin, t.autoConfirmMinutes, t.salonReadyMin, t.salonUnpaidMin, t.salonUnacceptedMin];
  if (enteros.some((n) => !Number.isFinite(n) || n <= 0)) return 'Los minutos tienen que ser mayores que cero.';
  if (t.kdsRedMin <= t.kdsYellowMin) return 'El rojo tiene que llegar después del ámbar.';
  if (t.autoConfirmMinutes > 60) return 'La confirmación automática puede esperar hasta 60 minutos.';
  return null;
}
