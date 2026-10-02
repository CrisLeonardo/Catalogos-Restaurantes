/* ============================================================
   ERRORES EN CASTELLANO (rediseño 2026-08-21, Fase 4)
   ------------------------------------------------------------
   "Error 500". "Failed to fetch". "TypeError: undefined is not an
   object". Eso no es un mensaje de error: es el sistema hablando
   solo delante del dueño de un restaurante, que además lo lee en
   plena hora pico.

   Un error tiene que decir dos cosas: qué pasó y qué hacer ahora.
   Este archivo traduce lo que sabemos reconocer y —clave— DEJA
   PASAR intacto lo que ya está escrito para una persona: media
   aplicación devuelve mensajes buenos ("Falta instalar el servicio
   en la PC del local") y machacarlos con un genérico sería
   cambiar información por ruido.
   ============================================================ */

/** Lo que se dice cuando no sabemos más: nunca deja al usuario sin salida. */
export const GENERIC_ERROR =
  'Algo falló de nuestro lado. Intenta otra vez en un momento; si sigue igual, escríbenos.';

/** Pares [huella técnica, qué le decimos a la persona]. Orden = prioridad. */
const RULES: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed|err_internet|err_network|load failed/i,
    'No se pudo conectar. Revisa tu internet e intenta otra vez.'],
  [/timeout|timed out|abort/i,
    'La conexión tardó demasiado. Puede ser la señal — intenta otra vez.'],
  [/jwt|token .*(expired|invalid)|not authenticated|unauthorized|\b401\b/i,
    'Tu sesión caducó. Vuelve a entrar y seguimos donde estabas.'],
  [/forbidden|not allowed|permission denied|row-level security|\b403\b/i,
    'Tu usuario no tiene permiso para hacer esto. Pídeselo al dueño del restaurante.'],
  [/duplicate key|already exists|unique constraint|\b409\b/i,
    'Ya existe algo con ese nombre. Prueba con otro.'],
  [/not found|no rows|\b404\b/i,
    'Eso ya no está. Puede que alguien lo haya borrado desde otra pantalla.'],
  [/violates foreign key|still referenced/i,
    'No se puede borrar porque algo más lo está usando. Quita primero lo que depende de esto.'],
  [/payload too large|file too large|\b413\b/i,
    'El archivo pesa demasiado. Prueba con una imagen más liviana.'],
  [/too many requests|rate limit|\b429\b/i,
    'Demasiados intentos seguidos. Espera unos segundos y vuelve a probar.'],
  [/\b5\d\d\b|internal server|service unavailable|bad gateway/i, GENERIC_ERROR],
];

/** Huellas de que el texto lo escribió una máquina, no una persona. */
const TECHNICAL =
  /(^|\s)(type|reference|syntax|range)?error\b|\bat\s+\w+[.(]|undefined|null\b|nan\b|[{}[\]<>]|^[A-Z0-9_]{4,}$|https?:\/\//i;

/**
 * Convierte cualquier cosa que se haya lanzado en una frase que un dueño de
 * restaurante pueda leer y accionar.
 *
 * Si el mensaje original ya está escrito para una persona, se devuelve tal
 * cual: sabe más del caso concreto que cualquier genérico nuestro.
 */
export function friendlyError(e: unknown): string {
  // Sin conexión se sabe sin mirar el error, y es la causa más común de todas.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Estás sin internet. Cuando vuelva la señal, intenta otra vez.';
  }

  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();
  if (!raw) return GENERIC_ERROR;

  for (const [pattern, message] of RULES) {
    if (pattern.test(raw)) return message;
  }

  // Ni reconocido ni legible: mejor un genérico honesto que jerga.
  if (TECHNICAL.test(raw)) return GENERIC_ERROR;

  // Ya venía escrito para una persona.
  return raw;
}
