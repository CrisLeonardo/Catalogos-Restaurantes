/* Ajustes › Salón — CÓMO ESTÁ ARMADO el salón.
   ------------------------------------------------------------------
   La otra mitad de la vieja pantalla «Mesas»: cuántas mesas hay, sus
   códigos QR y NFC, el plano por niveles y la propina. Se toca una vez
   al montar el local y casi nunca más, así que su sitio es Ajustes.

   Lo que está pasando en el salón vive en Pedidos › Mesas.

   Es el MISMO componente de siempre (`tables-panel.tsx`): no se
   reescribió nada, solo cambió de sitio. */

import { redirect } from 'next/navigation';
import TablesPanel from '@/components/admin/tables-panel';
import PlanLockedScreen from '@/components/admin/plan-locked-screen';
import { getSalonData } from '../../mesas/salon-data';
import { panelLink } from '@/lib/panel-links-server';
import { getActiveTableNumbers } from '@/lib/db/orders';

export const metadata = { title: 'Salón – Panel admin' };

export default async function AjustesSalonPage() {
  const { restaurantId, slug, config, hasWaiterPanel, hasDineIn, isSuperAdmin, menuUrl } = await getSalonData();

  // Mismo candado que la pantalla de operación, para que no haya una
  // puerta de atrás a la configuración.
  if (!isSuperAdmin && !hasWaiterPanel && !hasDineIn) {
    return (
      <PlanLockedScreen
        feature="Configuración del salón"
        description="El plano del salón, los códigos QR de mesa y la propina son parte del panel de mesero, exclusivo del plan Premium."
        icon="grid"
      />
    );
  }

  if (!restaurantId || !slug || !config) redirect(await panelLink('/admin/mesas'));

  /* Ficha 2.8 (R27.2): las mesas con cuenta abierta, para no quitarlas sin
     resolverlas al bajar el número de mesas. */
  const ocupacion = await getActiveTableNumbers(restaurantId);
  const ocupadas = Object.entries(ocupacion).map(([n, o]) => ({ n: Number(n), total: Math.max(0, o.total - (o.paid ?? 0)) }));

  return (
    <TablesPanel
      restaurantId={restaurantId}
      slug={slug}
      menuUrl={menuUrl}
      restaurantName={config.brandName}
      ocupadas={ocupadas}
      config={{
        orderTypes: config.orderTypes,
        dineInTableCount: config.dineInTableCount,
        dineInCourseOptions: config.dineInCourseOptions,
        pedidoDeMesa: config.pedidoDeMesa === true,
        tipEnabled: config.tipEnabled,
        tipPercent: config.tipPercent,
        acceptsCard: config.acceptsCard,
        currencySymbol: config.currencySymbol,
        currencyPosition: config.currencyPosition,
        locale: config.locale,
        animations: config.animations,
        floorPlan: config.floorPlan,
      }}
    />
  );
}
