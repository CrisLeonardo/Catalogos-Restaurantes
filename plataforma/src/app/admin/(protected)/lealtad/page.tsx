import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getLoyaltySettings, getLoyaltyAccounts, getLoyaltySummary, getCustomersForLoyalty, loyaltySettingsExist } from '@/lib/db/loyalty';
import LoyaltyPanel from '@/components/admin/loyalty-panel';

export const metadata = { title: 'Lealtad – Panel admin' };

export default async function LealtadPage() {
  const mc = await resolveModuleContext('loyalty');
  if (!mc.ok) redirect('/admin/modulos');

  const [settings, accounts, summary, customers, hasSettings] = await Promise.all([
    getLoyaltySettings(mc.restaurantId),
    getLoyaltyAccounts(mc.restaurantId),
    getLoyaltySummary(mc.restaurantId),
    getCustomersForLoyalty(mc.restaurantId),
    loyaltySettingsExist(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <LoyaltyPanel
        restaurantId={mc.restaurantId}
        settings={settings}
        accounts={accounts}
        customers={customers}
        summary={summary}
        hasSettings={hasSettings}
      />
    </div>
  );
}
