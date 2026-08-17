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

import { isValidDeviceId } from '@/lib/auth/pin-policy';

const KEY = 'leogin-device-id';

/** Espejo en cookie, para que el SERVIDOR pueda leer el mismo id.
    Debe coincidir con DEVICE_COOKIE de lib/auth/trusted-device.ts. */
const COOKIE = 'leogin_device';
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // 400 días: el techo que aceptan los navegadores

/* La cookie se comparte entre subdominios (`.leogin.online`), igual que la
   sesión del personal. Es lo que hace que este aparato sea EL MISMO aparato
   en el menú (`slug.dominio`) y en el panel (`slug-admin.dominio`): sin eso,
   autorizar la tableta desde el panel no serviría de nada en la pantalla de
   login, que es donde se usa el PIN. En local no se fuerza dominio. */
const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes('localhost');
const COOKIE_DOMAIN = isLocalEnv ? null : `.${rootDomainRaw.split(':')[0]}`;

/** Lee la cookie del aparato, si la hay y tiene forma de id. */
function readCookie(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : null;
    return isValidDeviceId(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Copia el id a una cookie legible por el servidor.
 *
 * Por qué hace falta: el id vive en localStorage, que el servidor no ve. La
 * pantalla de login necesita saber ANTES de pintar si este aparato es del
 * local (para abrir directo en la grilla de PIN); sin la cookie tendría que
 * preguntarlo después de cargar y la pantalla parpadearía entre los dos
 * estados en cada visita.
 *
 * No lleva nada personal: es el mismo id anónimo de siempre. `SameSite=Lax`
 * para que no viaje en peticiones de terceros.
 */
function mirrorToCookie(id: string): void {
  try {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : '';
    document.cookie = `${COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${domain}${secure}`;
  } catch {
    /* cookies bloqueadas → el servidor no reconocerá el aparato, nada más */
  }
}

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
  // Orden a propósito: localStorage manda (es el original), pero si este
  // subdominio todavía no tiene el suyo se ADOPTA el de la cookie antes de
  // inventar uno nuevo. Sin ese paso, el mismo aparato tendría un id en
  // `slug.dominio` y otro en `slug-admin.dominio` —localStorage no cruza
  // orígenes— y "autorizar este dispositivo" desde el panel no valdría en la
  // pantalla de login.
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) {
      mirrorToCookie(saved);
      return saved;
    }
    const id = readCookie() ?? newId();
    window.localStorage.setItem(KEY, id);
    mirrorToCookie(id);
    return id;
  } catch {
    // localStorage bloqueado (modo privado estricto): la cookie sola sirve.
    return readCookie();
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
