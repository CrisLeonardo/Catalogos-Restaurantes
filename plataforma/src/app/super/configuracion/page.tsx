import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { getPricingSettings } from '@/lib/db/billing';
import { getApiKeys } from '@/lib/actions/api-keys';
import PlatformSettingsForm from '@/components/super/platform-settings-form';
import PricingSettingsForm from '@/components/super/pricing-settings-form';
import ApiKeysManager from '@/components/super/api-keys-manager';

export const metadata: Metadata = { title: 'Configuración — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const [settings, pricing, apiKeys] = await Promise.all([
    getPlatformContactSettings(),
    getPricingSettings(),
    getApiKeys(),
  ]);
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>
          Configuración de la plataforma
        </h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', marginTop: 6 }}>
          Precios de los planes, reglas de cobro y datos de contacto de soporte.
        </p>
      </div>
      <PricingSettingsForm pricing={pricing} />
      <PlatformSettingsForm settings={settings} />
      <ApiKeysManager initialKeys={apiKeys} />
    </div>
  );
}
