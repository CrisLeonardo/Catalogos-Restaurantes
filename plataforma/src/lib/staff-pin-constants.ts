/**
 * La FORMA del PIN de operador, sin la criptografía.
 *
 * Vive aparte de `staff-pin-crypto.ts` porque ese módulo importa
 * `node:crypto`: cualquier componente de cliente que quisiera saber cuántos
 * dígitos tiene un PIN se arrastraba el hash entero al navegador (y ni
 * siquiera compila). Antes eso se resolvía escribiendo un `4` a mano en cada
 * pantalla, que es exactamente la clase de número que se queda desfasado el
 * día que alguien pida PIN de seis.
 *
 * `staff-pin-crypto.ts` las reexporta, así que el servidor las sigue
 * importando de donde siempre.
 */
export const PIN_LENGTH = 4;
export const PIN_LOCK_AFTER_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;
