/* ============================================================
   IDENTIDAD DE ESTE DISPOSITIVO (solo navegador)
   ------------------------------------------------------------
   Un id anónimo y estable por navegador, guardado en localStorage. No
   identifica a una persona ni viaja a ningún sitio salvo cuando el dueño
   enciende la "PC principal del local" (migración 110): ahí se guarda junto
   al agente para que el panel pueda distinguir "esta computadora es la
   principal" de "la principal es otra y esta solo la está mirando".

   Por qué localStorage y no algo del sistema: desde una página web no hay
   forma de leer el nombre del equipo, y el agente solo reporta el suyo
   cuando ya está instalado y corriendo. Esto funciona en el celular, en el
   navegador y dentro de Leogin Desktop sin pedir permisos ni versiones
   nuevas de nada.

   Límites conocidos (y asumidos): borrar los datos del sitio, o abrir el
   panel en OTRO navegador de la misma PC, da un id distinto — el panel dirá
   "la principal es otra computadora" desde ese navegador. Es el error
   prudente: prefiere no afirmar que este aparato es el servidor del local
   antes que afirmarlo sin saberlo.
   ============================================================ */

const KEY = 'leogin-device-id';

/** Id aleatorio; `randomUUID` no existe fuera de contextos seguros. */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* cae al azar de abajo */
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Id de este navegador/dispositivo. Lo crea la primera vez.
 * Devuelve null en el servidor o si el almacenamiento está bloqueado (modo
 * privado estricto): sin id, el panel cae al estado "no sabemos cuál es",
 * que es exactamente lo que corresponde.
 */
export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** Nombre corto y honesto de este aparato: "Windows · Leogin Desktop". */
export function describeThisDevice(inDesktop = false): string {
  if (typeof navigator === 'undefined') return 'Este dispositivo';
  const ua = navigator.userAgent;
  const os =
    /Windows/i.test(ua) ? 'Windows'
      : /Android/i.test(ua) ? 'Android'
        : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
          : /Mac OS X/i.test(ua) ? 'Mac'
            : /Linux/i.test(ua) ? 'Linux'
              : 'Este dispositivo';
  if (inDesktop) return `${os} · Leogin Desktop`;
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
      : /OPR\//i.test(ua) ? 'Opera'
        : /Chrome\//i.test(ua) ? 'Chrome'
          : /Firefox\//i.test(ua) ? 'Firefox'
            : /Safari\//i.test(ua) ? 'Safari'
              : null;
  return browser ? `${os} · ${browser}` : os;
}
