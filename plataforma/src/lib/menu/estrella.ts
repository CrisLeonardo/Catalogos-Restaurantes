import 'server-only';

/* ============================================================
   EL PLATILLO ESTRELLA DE LA VISTA PREVIA (fase 4, F4-9; resto de CV-04)
   ------------------------------------------------------------
   El enlace general de la carta mostraba en WhatsApp el nombre y la
   paleta, sin comida. Ahora lleva la foto del platillo más pedido de
   la semana que tenga foto y se pueda pedir; si no hay ventas, el
   primer destacado con foto. Sin ninguno, la tarjeta sigue como era.
   ============================================================ */

import { getMasPedidosSemanaCached, getMenuDataCached } from '@/lib/db/menu';
import { esDestacado } from '@/lib/menu-pairings';
import { isUnavailable } from '@/lib/product-availability';

export interface Estrella { id: string; name: string; image_url: string }

export async function platilloEstrella(restaurantId: string): Promise<Estrella | null> {
  const [menu, mas] = await Promise.all([
    getMenuDataCached(restaurantId).catch(() => null),
    getMasPedidosSemanaCached(restaurantId).catch(() => []),
  ]);
  if (!menu) return null;
  const conFoto = menu.products.filter((p) => p.image_url && !isUnavailable(p));
  const porId = new Map(conFoto.map((p) => [p.id, p]));
  const vendido = mas.map((m) => porId.get(m.id)).find(Boolean);
  const elegido = vendido ?? conFoto.find((p) => esDestacado(p.tags));
  return elegido ? { id: elegido.id, name: elegido.name, image_url: elegido.image_url! } : null;
}
