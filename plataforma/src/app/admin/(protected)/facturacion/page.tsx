import { createServiceClient } from '@/lib/supabase/service';
import { resolveModuleContext } from '@/lib/modules-server';
import { getFelSettings, getFelEstadoConfig, listFelDocuments, getFelSummary, getInvoiceableOrders } from '@/lib/db/fel';
import FacturacionPanel from '@/components/admin/facturacion-panel';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Facturación (FEL) – Panel admin' };

export default async function FacturacionPage() {
  const mc = await resolveModuleContext('fel');
  /* Sin FEL activo se explicaba con un `redirect()` a Funciones: quien venía
     de Negocio aterrizaba en Ajustes sin saber por qué, y en una carga directa
     el router de Next resolvía esa redirección con una navegación dura y la
     consola lanzaba React #310 (auditoría 2026-10-02, N-08/N-09). Se dice aquí
     mismo. (La sesión y el restaurante ya los garantiza el layout.) */
  if (!mc.ok) {
    return (
      <div className="anim-fade-up">
        <EmptyState
          icon="receipt"
          title="La factura electrónica todavía no está activa"
          desc="Cuando Leogin la habilite para tu restaurante, desde aquí vas a emitir y consultar tus facturas (FEL) de cada cobro."
          action={{ label: 'Ver tus funciones', href: '/admin/modulos', icon: null }}
        />
      </div>
    );
  }

  const db = createServiceClient();
  const { count } = await db
    .from('fel_settings')
    .select('restaurant_id', { count: 'exact', head: true })
    .eq('restaurant_id', mc.restaurantId);

  const [settings, documents, summary, invoiceable] = await Promise.all([
    getFelSettings(mc.restaurantId),
    listFelDocuments(mc.restaurantId),
    getFelSummary(mc.restaurantId),
    getInvoiceableOrders(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <FacturacionPanel
        restaurantId={mc.restaurantId}
        settings={settings}
        estado={getFelEstadoConfig(settings)}
        documents={documents}
        summary={summary}
        invoiceable={invoiceable}
        hasSettingsRow={(count ?? 0) > 0}
      />
    </div>
  );
}
