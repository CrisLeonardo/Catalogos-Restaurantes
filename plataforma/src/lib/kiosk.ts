/* ============================================================
   MODO KIOSKO (autoservicio) — dispositivo COMPARTIDO del local
   ------------------------------------------------------------
   Una tablet/tótem en el mostrador donde los clientes arman su
   pedido solos (estilo restaurant.pe / McDonald's). El staff lo
   activa abriendo `slug.leogin.online/kiosko` en el dispositivo;
   se desactiva con `/kiosko?salir=1`.

   La bandera vive en sessionStorage (sobrevive recargas de la
   misma pestaña; no se filtra a otros dispositivos). En kiosko:
   · El menú oculta cuenta/fidelidad/mis pedidos (datos personales
     de OTROS clientes no deben verse en un aparato compartido).
   · El checkout es siempre "para recoger en mostrador", sin
     autocompletar ni guardar el perfil del cliente anterior.
   · Tras confirmar, la pantalla vuelve sola al menú para el
     siguiente cliente.
   Tolerante a fallos: sin sessionStorage (SSR) devuelve false.
   ============================================================ */

const KEY = 'leogin-kiosk';

/** ¿Este dispositivo está en modo kiosko? (solo cliente; false en SSR). */
export function isKioskMode(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setKioskMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch { /* no-op */ }
}
