import { PageHeader } from '@/components/super/ui';
import SectionTabs from '@/components/super/section-tabs';

/* Configuración de la plataforma, en 5 vistas:
   · Precios  — planes, módulos, descuentos y reglas de cobro
   · Soporte  — datos de contacto que ven los restaurantes
   · Portada  — restaurante en vitrina y testimonios de la web de ventas
   · API      — llaves para integraciones externas
   · Bitácora — lo que se ha hecho desde el Super Admin (migración 132) */

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        subtitle="Precios de los planes, reglas de cobro, contacto de soporte, la portada de la web, llaves API y la bitácora de lo que se hace desde aquí."
      />
      <SectionTabs
        base="/super/configuracion"
        tabs={[
          { seg: '', label: 'Precios y cobro', icon: 'wallet' },
          { seg: 'soporte', label: 'Soporte', icon: 'helpCircle' },
          { seg: 'portada', label: 'Portada', icon: 'globe' },
          { seg: 'api', label: 'API', icon: 'key' },
          { seg: 'bitacora', label: 'Bitácora', icon: 'list' },
        ]}
      />
      <div style={{ minHeight: 200 }}>{children}</div>
    </div>
  );
}
