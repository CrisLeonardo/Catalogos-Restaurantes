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

export const metadata = { title: 'Salón — Panel Admin' };

export default async function AjustesSalonPage() {
  const { restaurantId, config, hasWaiterPanel, hasDineIn, isSuperAdmin, menuUrl } = await getSalonData();

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

  if (!restaurantId || !config) redirect(await panelLink('/admin/mesas'));

  return (
    <TablesPanel
      restaurantId={restaurantId}
      menuUrl={menuUrl}
      config={{
        orderTypes: config.orderTypes,
        dineInTableCount: config.dineInTableCount,
        dineInCourseOptions: config.dineInCourseOptions,
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
