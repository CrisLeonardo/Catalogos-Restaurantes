/* ============================================================
   ENCARGOS CON CUPO — reglas puras (migración 149)
   ------------------------------------------------------------
   docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (N6).

   Una «tanda» de encargos: «Tamales del sábado», con día de entrega,
   hasta cuándo se reciben y cuántos pedidos caben. El cupo se cuenta
   sobre pedidos reales no anulados, así que anular devuelve el lugar.

   Sin base de datos: lo usan el menú, el checkout, createOrder y el
   panel, y se prueba sin levantar nada.
   ============================================================ */

export interface EncargoFecha {
  id: string;
  titulo: string;
  /** YYYY-MM-DD, día de entrega en la hora del restaurante. */
  entregaFecha: string;
  /** Texto libre: «8:00 a 11:00 a. m.». */
  entregaHora: string | null;
  /** ISO: a partir de aquí ya no se reciben encargos. */
  cierreAt: string;
  cupo: number;
  pagoAdelantado: boolean;
  activo: boolean;
  /** Pedidos no anulados que ya ocupan lugar. */
  ocupados: number;
}

export type EstadoEncargo = 'abierto' | 'lleno' | 'cerrado' | 'pausado';

export function estadoEncargo(f: Pick<EncargoFecha, 'activo' | 'cierreAt' | 'cupo' | 'ocupados'>, ahora: number = Date.now()): EstadoEncargo {
  if (!f.activo) return 'pausado';
  if (new Date(f.cierreAt).getTime() <= ahora) return 'cerrado';
  if (f.ocupados >= f.cupo) return 'lleno';
  return 'abierto';
}

export function lugaresLibres(f: Pick<EncargoFecha, 'cupo' | 'ocupados'>): number {
  return Math.max(0, f.cupo - f.ocupados);
}

/**
 * ¿Este pedido entró dentro del cupo? Se pregunta DESPUÉS de crearlo:
 * dos comensales que piden el último lugar a la vez crean los dos su
 * pedido, y los dos calculan el mismo orden (por fecha y luego por id),
 * así que solo el que quedó fuera se anula. Sin bloqueo ni función en
 * la base, y sin que nadie se quede con un lugar que no existía.
 */
export function entroEnElCupo(
  pedidos: { id: string; created_at: string }[],
  pedidoId: string,
  cupo: number,
): boolean {
  const orden = [...pedidos].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const puesto = orden.findIndex((p) => p.id === pedidoId);
  return puesto >= 0 && puesto < cupo;
}

/** Cuántos minutos le lleva a la zona horaria `tz` adelante de UTC en ese instante. */
function desfaseMin(instante: number, tz: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instante));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((comoUtc - instante) / 60_000);
}

/**
 * «2026-11-01T18:00» escrito por el dueño en la hora de SU restaurante →
 * instante ISO. null si no tiene forma de fecha y hora.
 */
export function horaLocalAIso(fechaHora: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(fechaHora.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const ingenuo = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(ingenuo)) return null;
  // Dos pasadas: el desfase se mide en el instante ya corregido, por si el
  // cambio de horario cae justo entre medio (Guatemala no tiene, otros sí).
  let instante = ingenuo - desfaseMin(ingenuo, tz) * 60_000;
  instante = ingenuo - desfaseMin(instante, tz) * 60_000;
  return new Date(instante).toISOString();
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «sáb 2 nov» a partir de YYYY-MM-DD (fecha de calendario, sin zona). */
export function diaDeEntrega(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[m - 1]}`;
}

/** «sáb 2 nov · 8:00 a 11:00 a. m.» */
export function textoEntrega(f: Pick<EncargoFecha, 'entregaFecha' | 'entregaHora'>): string {
  return f.entregaHora ? `${diaDeEntrega(f.entregaFecha)} · ${f.entregaHora}` : diaDeEntrega(f.entregaFecha);
}

/** «vie 1 nov, 6:00 p. m.» en la hora del restaurante. */
export function textoCierre(cierreAt: string, tz: string): string {
  const fecha = new Date(cierreAt);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
  const hora = new Intl.DateTimeFormat('es-GT', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(fecha);
  return `${diaDeEntrega(ymd)}, ${hora}`;
}

export interface NuevaFechaEntrada {
  titulo: string;
  entregaFecha: string;
  entregaHora: string;
  /** «YYYY-MM-DDTHH:mm» en la hora del restaurante. */
  cierre: string;
  cupo: number;
  pagoAdelantado: boolean;
}

/** Valida y normaliza lo que manda el formulario del panel. */
export function validarNuevaFecha(
  e: NuevaFechaEntrada,
  tz: string,
  ahora: number = Date.now(),
): { ok: true; fila: { titulo: string; entrega_fecha: string; entrega_hora: string | null; cierre_at: string; cupo: number; pago_adelantado: boolean } } | { ok: false; error: string } {
  const titulo = String(e.titulo ?? '').replace(/\s+/g, ' ').trim();
  if (titulo.length < 2) return { ok: false, error: 'Ponle un nombre al encargo, por ejemplo «Tamales del sábado».' };
  if (titulo.length > 80) return { ok: false, error: 'El nombre admite hasta 80 caracteres.' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.entregaFecha ?? '')) return { ok: false, error: 'Elige el día de entrega.' };
  const hora = String(e.entregaHora ?? '').trim().slice(0, 60) || null;

  const cierreAt = horaLocalAIso(String(e.cierre ?? ''), tz);
  if (!cierreAt) return { ok: false, error: 'Elige hasta cuándo recibes encargos.' };
  if (new Date(cierreAt).getTime() <= ahora) return { ok: false, error: 'La hora de cierre ya pasó.' };
  // El cierre puede ser el mismo día de la entrega (pedidos hasta las 6 a. m.
  // para entregar a las 10), nunca después.
  const finDeEntrega = horaLocalAIso(`${e.entregaFecha}T23:59`, tz);
  if (finDeEntrega && new Date(cierreAt).getTime() > new Date(finDeEntrega).getTime()) {
    return { ok: false, error: 'Los encargos tienen que cerrar antes de la entrega.' };
  }

  const cupo = Math.floor(Number(e.cupo));
  if (!Number.isFinite(cupo) || cupo < 1 || cupo > 10_000) return { ok: false, error: 'El cupo va de 1 a 10,000 pedidos.' };

  return {
    ok: true,
    fila: { titulo, entrega_fecha: e.entregaFecha, entrega_hora: hora, cierre_at: cierreAt, cupo, pago_adelantado: !!e.pagoAdelantado },
  };
}
