/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { planPriceLabel } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';

interface Props {
  feature: string;
  description: string;
  icon?: string;
}

/** Bloqueo de página completa para funciones exclusivas de Premium (no vendibles
   a la carta) a las que un plan inferior no debería poder entrar ni por URL directa.
   Server component: lee el precio vigente directo de la BD. */
export default async function PlanLockedScreen({ feature, description, icon = 'userPlus' }: Props) {
  const pricing = await getEffectivePlanPricing();
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass-solid anim-fade-up" style={{ maxWidth: 440, width: '100%', borderRadius: 'var(--radius-xl)', padding: '32px 26px', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: 'var(--radius-lg)', background: 'rgba(var(--brand-accent-rgb,99,102,241),0.13)', display: 'grid', placeItems: 'center', color: 'var(--brand-accent-ink)' }}>
          <Icon name={icon} size={24} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--u-text)', margin: 0 }}>
          {feature} requiere Premium
        </h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '10px 0 22px' }}>
          {description}
        </p>
        <Link
          href="/admin/suscripcion"
          className="press btn-accent"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14, textDecoration: 'none', color: '#fff' }}
        >
          <Icon name="sparkle" size={15} /> Actualizar a Premium — {planPriceLabel(pricing, 'PREMIUM')}
        </Link>
      </div>
    </div>
  );
}
