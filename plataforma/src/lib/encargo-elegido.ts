/* ============================================================
   ENCARGO ELEGIDO — qué tanda eligió el comensal en el menú
   ------------------------------------------------------------
   Va en sessionStorage, por restaurante: dura lo que dura la visita
   y no se cuela en el pedido de mañana. El carrito lo lee para mandar
   `?encargo=` al checkout; el checkout lo borra al confirmar.
   ============================================================ */

export interface EncargoElegido {
  id: string;
  titulo: string;
  /** «sáb 7 nov · 8 a 11 a. m.» ya armado. */
  entrega: string;
}

const EVENTO = 'leogin:encargo-elegido';
const clave = (restaurantId: string) => `encargo-elegido:${restaurantId}`;

export function leerEncargoElegido(restaurantId: string): EncargoElegido | null {
  try {
    const v = sessionStorage.getItem(clave(restaurantId));
    if (!v) return null;
    const e = JSON.parse(v) as EncargoElegido;
    return e && typeof e.id === 'string' && /^[0-9a-f-]{36}$/i.test(e.id) ? e : null;
  } catch {
    return null;
  }
}

export function elegirEncargo(restaurantId: string, e: EncargoElegido | null): void {
  try {
    if (e) sessionStorage.setItem(clave(restaurantId), JSON.stringify(e));
    else sessionStorage.removeItem(clave(restaurantId));
  } catch {
    /* modo privado sin almacenamiento: la elección vive solo en esta pantalla */
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { restaurantId } }));
}

/** Avisa cuando cambia la elección (menú y carrito están en árboles distintos). */
export function alCambiarEncargo(restaurantId: string, cb: (e: EncargoElegido | null) => void): () => void {
  const h = (ev: Event) => {
    if ((ev as CustomEvent<{ restaurantId: string }>).detail?.restaurantId === restaurantId) cb(leerEncargoElegido(restaurantId));
  };
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}
