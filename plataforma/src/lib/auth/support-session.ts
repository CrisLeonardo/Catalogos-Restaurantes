import 'server-only';

import { mintToken, readToken, passCookieOptions, PASS_COOKIE_DOMAIN } from '@/lib/auth/signed-token';

/* ============================================================
   MODO SOPORTE — pase temporal del SUPER_ADMIN a un panel ajeno
   ------------------------------------------------------------
   El Super Admin de Leogin necesita poder entrar al panel de un
   restaurante para dar soporte. Hasta ahora eso pasaba SOLO, sin
   decir nada: con la sesión iniciada bastaba con teclear la URL del
   panel de cualquier restaurante para quedar dentro, con la barra
   lateral con la marca del cliente y acceso a finanzas, clientes y
   pedidos. Verificado en local el 2026-08-08.

   No era un agujero de permisos —el Super Admin ya ve todo eso
   desde /super— pero sí tres problemas reales:
     · el cliente no tenía forma de saber que alguien de la
       plataforma estuvo dentro de su panel;
     · un descuido (una pestaña olvidada en la PC del restaurante)
       entrega la plataforma entera, no un panel;
     · si esa cookie se roba, el atacante entra a CUALQUIER panel sin
       dejar rastro que distinga su visita de las legítimas.

   Ahora hace falta un PASE explícito por restaurante: se pide en
   /admin/soporte, dura SUPPORT_TTL_MS y queda anotado en la bitácora
   del restaurante. El panel muestra una franja roja mientras dura.
   ============================================================ */

/** Cookie del pase. Mismo alcance de dominio que la sesión del personal. */
export const SUPPORT_COOKIE = 'leogin_soporte';

/** Cuánto dura un pase antes de tener que volver a pedirlo. */
export const SUPPORT_TTL_MS = 2 * 60 * 60_000; // 2 horas

const SCOPE = 'soporte';

export const SUPPORT_COOKIE_DOMAIN = PASS_COOKIE_DOMAIN;

/** Crea el valor de cookie del pase para `restaurantId`. */
export function mintSupportTicket(restaurantId: string): string {
  return mintToken(SCOPE, restaurantId, SUPPORT_TTL_MS);
}

/**
 * Id del restaurante para el que vale el pase, o null si no hay pase, está
 * vencido o la firma no cuadra.
 */
export function readSupportTicket(cookieValue: string | undefined): string | null {
  return readToken(SCOPE, cookieValue);
}

/** Opciones con las que se escribe (y se borra) la cookie del pase. */
export const supportCookieOptions = passCookieOptions;
