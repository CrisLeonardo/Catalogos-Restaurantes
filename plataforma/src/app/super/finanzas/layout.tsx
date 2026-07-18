import { PageHeader } from '@/components/super/ui';
import SectionTabs from '@/components/super/section-tabs';

/* Finanzas del super admin, en 3 vistas:
   · Resumen  — cuánto entra, cómo crece y a quién hay que cobrarle
   · Cobranza — la operación mensual (mensualidades, vencidos, suspensión)
   · Pagos    — historial de pagos registrados con recibo PDF */

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Finanzas"
        subtitle="Los números de Leogin: ingresos, cobranza y pagos de tus restaurantes."
      />
      <SectionTabs
        base="/super/finanzas"
        tabs={[
          { seg: '', label: 'Resumen', icon: 'chart' },
          { seg: 'cobranza', label: 'Cobranza', icon: 'wallet' },
          { seg: 'pagos', label: 'Pagos', icon: 'checkCircle' },
        ]}
      />
      <div style={{ minHeight: 200 }}>{children}</div>
    </div>
  );
}
