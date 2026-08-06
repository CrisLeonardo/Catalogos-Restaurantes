import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { getChannelMap, getMappableProducts, getChannelSummary } from '@/lib/db/channels';
import CanalesPanel from '@/components/admin/canales-panel';

export const metadata = { title: 'Canales externos – Panel admin' };

/* ============================================================
   /admin/canales — pedidos de PedidosYa, Rappi y UberEats (Fase 5A)
   ------------------------------------------------------------
   No está detrás de un módulo activable a propósito: el candado real es
   la API key con permiso 'orders:write', que emite Leogin. Así el dueño
   puede dejar sus productos mapeados antes de que el canal esté
   contratado, y no entra un solo pedido hasta que la llave exista.
   ============================================================ */

export default async function CanalesPage() {
  const ctx = await getAdminContext();
  const restaurantId = ctx?.restaurant?.id;
  if (!restaurantId) redirect('/admin');

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
