import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { listarBusquedasSinRespuesta } from '@/lib/db/ayuda-sin-respuesta';
import PlatformSettingsForm from '@/components/super/platform-settings-form';
import BusquedasSinRespuesta from '@/components/super/busquedas-sin-respuesta';

export const metadata: Metadata = { title: 'Soporte — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionSoportePage() {
  const [settings, busquedas] = await Promise.all([getPlatformContactSettings(), listarBusquedasSinRespuesta()]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PlatformSettingsForm settings={settings} />
      <BusquedasSinRespuesta filas={busquedas.filas} migracionPendiente={busquedas.migracionPendiente} />
    </div>
  );
}
