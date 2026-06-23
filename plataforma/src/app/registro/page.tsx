import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { rootDomainForUrls } from '@/lib/tenant';
import SignupWizard from './signup-wizard';

export const metadata: Metadata = {
  title: 'Crea tu restaurante — Leogin',
  description: 'Crea tu menú digital con pedidos en línea en minutos. 14 días de prueba gratis, sin tarjeta.',
  robots: { index: true, follow: true },
};

const PERKS = [
  { icon: 'bag', text: 'Menú web por QR, rápido y a tu marca' },
  { icon: 'list', text: 'Pedidos en línea con alerta en tiempo real' },
  { icon: 'sparkle', text: 'Personalización total: colores, logo y estilo' },
  { icon: 'wallet', text: '14 días gratis · sin tarjeta · cancela cuando quieras' },
];

export default function RegistroPage() {
  const rootDomain = rootDomainForUrls();

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
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

      <div
        className="anim-fade-up"
        style={{
          flex: 1, width: '100%', maxWidth: 980, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 28,
          padding: '32px 18px 64px', alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'start' }}>
          {/* Lado izquierdo: promesa */}
          <div style={{ paddingTop: 8 }}>
            <div className="t-kicker" style={{ fontSize: 11, marginBottom: 14 }}>Crea tu restaurante</div>
            <h1 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.05 }}>
              Tu menú en línea, en vivo hoy mismo.
            </h1>
            <p className="t-mute" style={{ fontSize: 15, lineHeight: 1.55, marginTop: 14, maxWidth: 420 }}>
              Regístrate, personaliza y comparte. Sin instalar nada, sin saber de tecnología.
              Te guiamos paso a paso.
            </p>
            <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PERKS.map((p) => (
                <li key={p.text} style={{ display: 'flex', gap: 11, alignItems: 'center', fontSize: 14 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)', color: 'var(--brand-accent)' }}>
                    <Icon name={p.icon} size={16} />
                  </span>
                  <span style={{ color: 'var(--u-text-2)' }}>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lado derecho: wizard */}
          <Glass style={{ padding: '26px 24px' }}>
            <SignupWizard rootDomain={rootDomain} />
          </Glass>
        </div>
      </div>
    </main>
  );
}
