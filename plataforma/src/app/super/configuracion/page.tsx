import type { Metadata } from 'next';
import { getPricingSettings } from '@/lib/db/billing';
import PricingSettingsForm from '@/components/super/pricing-settings-form';

export const metadata: Metadata = { title: 'Precios — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPreciosPage() {
  const pricing = await getPricingSettings();
  return <PricingSettingsForm pricing={pricing} />;
}
