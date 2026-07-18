import { PageHeader } from '@/components/super/ui';
import SectionTabs from '@/components/super/section-tabs';

/* Configuración de la plataforma, en 3 vistas:
   · Precios  — planes, módulos, descuentos y reglas de cobro
   · Soporte  — datos de contacto que ven los restaurantes
   · API      — llaves para integraciones externas */

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Configuración de la plataforma"
        subtitle="Precios de los planes, reglas de cobro, contacto de soporte y llaves API."
      />
      <SectionTabs
        base="/super/configuracion"
        tabs={[
          { seg: '', label: 'Precios y cobro', icon: 'wallet' },
          { seg: 'soporte', label: 'Soporte', icon: 'helpCircle' },
          { seg: 'api', label: 'API', icon: 'key' },
        ]}
      />
      <div style={{ minHeight: 200 }}>{children}</div>
    </div>
  );
}
