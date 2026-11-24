/**
 * ¿Cambió el precio mientras el comensal tenía el carrito abierto?
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23, OP-02. El servidor nunca cobra el
 * precio que manda el navegador (sería falsificable): lo recalcula de la
 * base. Pero si el dueño subía un precio con el carrito ya armado, el
 * pedido se guardaba con el precio nuevo y el comensal había confirmado
 * otro total —y si paga en efectivo, llevaba el cambio equivocado—.
 *
 * Ahora, si algún precio no coincide con el que vio, el pedido NO se crea:
 * se le devuelven los precios vigentes, el carrito se actualiza y se le dice
 * qué cambió para que confirme el total nuevo. Funciona igual si el precio
 * bajó: también se le avisa, porque el total que vio ya no es el real.
 */

export interface PrecioCambiado { indice: number; nombre: string; antes: number; ahora: number }

/** Diferencias de centavo o más entre lo que vio y lo que vale ahora. */
export function preciosCambiados(
  vistos: { name: string; price: number }[],
  vigentes: { price: number }[],
): PrecioCambiado[] {
  const cambios: PrecioCambiado[] = [];
  vistos.forEach((v, i) => {
    const ahora = vigentes[i]?.price;
    if (ahora == null) return;
    if (Math.abs(Math.round(ahora * 100) - Math.round(v.price * 100)) >= 1) {
      cambios.push({ indice: i, nombre: v.name, antes: v.price, ahora });
    }
  });
  return cambios;
}

/** El aviso para el comensal, con el monto en quetzales. */
export function avisoDePrecios(cambios: PrecioCambiado[], formato: (n: number) => string): string {
  if (cambios.length === 0) return '';
  if (cambios.length === 1) {
    const c = cambios[0];
    return `Cambió el precio de «${c.nombre}»: ahora cuesta ${formato(c.ahora)}. Ya actualizamos tu carrito; revisa el total y vuelve a enviar.`;
  }
  return `Cambiaron los precios de ${cambios.map((c) => `«${c.nombre}»`).join(', ')}. Ya actualizamos tu carrito; revisa el total y vuelve a enviar.`;
}
