import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { getPricingSettings } from '@/lib/db/billing';
import { getApiKeys } from '@/lib/actions/api-keys';
import PlatformSettingsForm from '@/components/super/platform-settings-form';
import PricingSettingsForm from '@/components/super/pricing-settings-form';
import ApiKeysManager from '@/components/super/api-keys-manager';
import { PageHeader } from '@/components/super/ui';

export const metadata: Metadata = { title: 'Configuración — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const [settings, pricing, apiKeys] = await Promise.all([
    getPlatformContactSettings(),
    getPricingSettings(),
    getApiKeys(),
  ]);
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Configuración de la plataforma"
        subtitle="Precios de los planes, reglas de cobro y datos de contacto de soporte."
      />
      <PricingSettingsForm pricing={pricing} />
      <PlatformSettingsForm settings={settings} />
      <ApiKeysManager initialKeys={apiKeys} />
    </div>
  );
}
