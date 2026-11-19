/* ============================================================
   EMBUDO DE LA CARTA (auditoría «La carta que vende», CV-37)
   ------------------------------------------------------------
   apertura → ficha → agregar → checkout → pedido, por canal (QR de
   mesa, enlace general, enlace de un platillo). Solo cliente.

   El canal se decide UNA vez, al abrir la carta, y se recuerda en la
   pestaña: el checkout no sabe por qué puerta entró el comensal, pero
   la pestaña sí. Cada paso se manda una vez por pestaña (y la base lo
   cuenta una vez por día). Nunca en la vista previa del editor.
   ============================================================ */

import { trackEmbudo } from '@/lib/actions/metrics';
import { getVisitorId } from '@/lib/customer-local';

export type CanalCarta = 'mesa' | 'general' | 'platillo';
export type PasoEmbudo = 'apertura' | 'ficha' | 'agregar' | 'checkout' | 'pedido';

const claveCanal = (rid: string) => `embudo-canal-${rid}`;

/** Al abrir la carta: fija el canal de esta pestaña y cuenta la apertura. */
export function abrirEmbudo(restaurantId: string, canal: CanalCarta): void {
  try {
    sessionStorage.setItem(claveCanal(restaurantId), canal);
  } catch { /* sin almacenamiento: se cuenta como «general» */ }
  contarPaso(restaurantId, 'apertura');
}

export function contarPaso(restaurantId: string, paso: PasoEmbudo): void {
  try {
    if (typeof window === 'undefined' || window.location.pathname.startsWith('/preview')) return;
    const ya = `embudo-${restaurantId}-${paso}`;
    if (sessionStorage.getItem(ya)) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;
    sessionStorage.setItem(ya, '1');
    const canal = (sessionStorage.getItem(claveCanal(restaurantId)) as CanalCarta | null) ?? 'general';
    void trackEmbudo(restaurantId, visitorId, canal, paso).catch(() => {});
  } catch { /* medir nunca rompe la carta */ }
}
