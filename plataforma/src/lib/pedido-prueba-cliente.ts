/* El pase del pedido de prueba, del lado de la carta (ver lib/pedido-prueba.ts).

   Llega en la URL (`?prueba=…`) cuando el dueño toca «Hacer pedido de
   prueba» en Hoy. Se guarda en la sesión de la pestaña —no en el aparato:
   al cerrarla se olvida— y se borra de la URL para que un enlace copiado
   no lo arrastre. El checkout lo manda con el pedido; el servidor decide si
   vale. Todo con try/catch: sin almacenamiento, el pedido sale normal. */

const clave = (restaurantId: string) => `leogin:prueba:${restaurantId}`;

export function capturarPasePrueba(restaurantId: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const pase = params.get('prueba');
  if (!pase) return false;
  try { window.sessionStorage.setItem(clave(restaurantId), pase); } catch { /* sin almacenamiento */ }
  params.delete('prueba');
  const qs = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  return true;
}

export function leerPasePrueba(restaurantId: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage.getItem(clave(restaurantId)); } catch { return null; }
}

export function olvidarPasePrueba(restaurantId: string): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(clave(restaurantId)); } catch { /* nada */ }
}
