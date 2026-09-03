import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { getChannelMap, getMappableProducts, getChannelSummary } from '@/lib/db/channels';
import CanalesPanel from '@/components/admin/canales-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Canales externos – Panel admin' };

/* ============================================================
   /admin/canales — pedidos de PedidosYa, Rappi y UberEats (Fase 5A)
   ------------------------------------------------------------
   No está detrás de un módulo activable a propósito: el candado real es
   la API key con permiso 'orders:write', que emite Leogin. Así el dueño
   puede dejar sus productos mapeados antes de que el canal esté
   contratado, y no entra un solo pedido hasta que la llave exista.
   ============================================================ */

// Deshabilitado a propósito: la Fase 5A sigue en pruebas y aún no se
// lanza. El link del nav ya no aparece (ver admin-nav.ts); este redirect
// es el respaldo para quien entre directo por la URL.
const CANALES_HABILITADO = false;

export default async function CanalesPage() {
  if (!CANALES_HABILITADO) redirect(await panelLink('/admin'));

  const ctx = await getAdminContext();
  const restaurantId = ctx?.restaurant?.id;
  if (!restaurantId) redirect(await panelLink('/admin'));

  const [mappings, products, summary] = await Promise.all([
    getChannelMap(restaurantId),
    getMappableProducts(restaurantId),
    getChannelSummary(restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <CanalesPanel
        restaurantId={restaurantId}
        mappings={mappings}
        products={products}
        summary={summary}
      />
    </div>
  );
}
