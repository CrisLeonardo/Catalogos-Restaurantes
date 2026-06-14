import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import PlatformSettingsForm from '@/components/super/platform-settings-form';

export const metadata: Metadata = { title: 'Configuración — Super Admin' };

export default async function ConfiguracionPage() {
  const settings = await getPlatformContactSettings();
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>
          Configuración de la plataforma
        </h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', marginTop: 6 }}>
          Datos de contacto que aparecen en la página de Soporte del panel de cada restaurante.
        </p>
      </div>
      <PlatformSettingsForm settings={settings} />
    </div>
  );
}
