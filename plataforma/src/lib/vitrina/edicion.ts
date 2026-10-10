/* Estado de la edición viva de la Vitrina (modo lanzamiento).

   La edición vive en el tema: `launchMode`, `launchOpensAt` y `launchEndsAt`
   (instantes ISO; el editor los guarda con zona). De ahí sale UNA sola
   respuesta que usan a la vez el menú (portada, botones) y el servidor
   (`createOrder` rechaza pedidos fuera de la edición), para que la pantalla
   y el candado no puedan discrepar.

   Sin dependencias de React: importable en server y cliente. */

export type EstadoEdicion = 'sin' | 'proxima' | 'abierta' | 'cerrada';

export interface Edicion {
  estado: EstadoEdicion;
  abre: number | null;
  cierra: number | null;
}

/** Instante en ms de un ISO del tema; null si está vacío o no se entiende. */
export function instante(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function estadoEdicion(
  config: { launchMode?: boolean; launchOpensAt?: string | null; launchEndsAt?: string | null },
  now: number,
): Edicion {
  const abre = instante(config.launchOpensAt);
  const cierra = instante(config.launchEndsAt);
  if (!config.launchMode) return { estado: 'sin', abre, cierra };
  if (abre !== null && now < abre) return { estado: 'proxima', abre, cierra };
  if (cierra !== null && now >= cierra) return { estado: 'cerrada', abre, cierra };
  return { estado: 'abierta', abre, cierra };
}

/** ¿Se puede pedir? Sin modo lanzamiento, siempre (manda el horario normal). */
export function edicionPermitePedir(e: Edicion): boolean {
  return e.estado === 'sin' || e.estado === 'abierta';
}

/** «3 h 12 min», «2 d 4 h», «45 min». Para «Agotado en …». */
export function duracionCorta(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** «dom, 18 oct, 12:00» en la zona del restaurante. */
export function fechaCorta(ms: number, timeZone = 'America/Guatemala'): string {
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(new Date(ms)).replace(/\./g, '');
}

/** Lo que el servidor le contesta a quien intenta pedir fuera de la edición. */
export function motivoSinPedidos(e: Edicion, cerradaTexto: string, timeZone?: string): string {
  if (e.estado === 'proxima' && e.abre !== null) return `Esta edición abre el ${fechaCorta(e.abre, timeZone)}.`;
  return cerradaTexto.trim() || 'Esta edición ya cerró.';
}

/** Enlace de WhatsApp con el mensaje ya escrito («Avísame cuando salga…»).
    null si el restaurante no tiene número. */
export function enlaceAvisame(numero: string | null | undefined, edicion: string): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  if (digitos.length < 8) return null;
  const texto = `Hola, avísame cuando salga ${edicion.trim() || 'la próxima edición'}.`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
