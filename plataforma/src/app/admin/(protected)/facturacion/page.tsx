import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveModuleContext } from '@/lib/modules-server';
import { getFelSettings, getFelEstadoConfig, listFelDocuments, getFelSummary, getInvoiceableOrders } from '@/lib/db/fel';
import FacturacionPanel from '@/components/admin/facturacion-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Facturación (FEL) – Panel admin' };

export default async function FacturacionPage() {
  const mc = await resolveModuleContext('fel');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

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
