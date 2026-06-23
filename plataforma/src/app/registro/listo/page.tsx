import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { adminUrl, subdomainUrl } from '@/lib/tenant';

export const metadata: Metadata = {
  title: '¡Tu restaurante está listo! — Leogin',
  robots: { index: false, follow: false },
};

export default async function RegistroListoPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const safeSlug = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const panelUrl = safeSlug ? adminUrl(safeSlug) : '/login';
  const menuUrl = safeSlug ? subdomainUrl(safeSlug) : '/';

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}><LeoginLogo size={26} /></Link>
      </header>

      <div className="anim-fade-up" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 18px 64px' }}>
        <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px', display: 'grid', placeItems: 'center', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
            <Icon name="checkCircle" size={32} />
          </div>
          <h1 className="t-display" style={{ fontSize: 26, lineHeight: 1.1 }}>¡Tu restaurante está en vivo!</h1>
          <p className="t-mute" style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 10 }}>
            Empieza tu prueba gratis de 14 días. Lo primero: entra a tu panel y personaliza tu menú.
            Te llevamos de la mano.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
            <a
              href={panelUrl}
              className="press btn-accent"
              style={{ padding: '14px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 15, textDecoration: 'none', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Entrar a mi panel <Icon name="arrowRight" size={16} />
            </a>
            <a
              href={menuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{ padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'var(--u-text)', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              Ver mi menú <Icon name="arrowUpRight" size={15} />
            </a>
          </div>

          <Glass variant="quiet" style={{ marginTop: 22, padding: '13px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, textAlign: 'left' }}>
            <Icon name="helpCircle" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
            Si te pide iniciar sesión, usa el correo y la contraseña que acabas de registrar.
          </Glass>
        </div>
      </div>
    </main>
  );
}
