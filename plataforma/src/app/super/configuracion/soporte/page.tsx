import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import PlatformSettingsForm from '@/components/super/platform-settings-form';

export const metadata: Metadata = { title: 'Soporte — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionSoportePage() {
  const settings = await getPlatformContactSettings();
  return <PlatformSettingsForm settings={settings} />;
}
