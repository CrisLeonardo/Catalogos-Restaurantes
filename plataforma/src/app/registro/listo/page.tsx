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

const PLAN_INFO = {
  PREMIUM: {
    name: 'Premium',
    badge: 'PRUEBA 30 DÍAS',
    badgeColor: '#818cf8',
    badgeBg: 'rgba(129,140,248,0.14)',
    detail: 'luego Q600 / mes · sin tarjeta ni compromiso',
    subtitle: 'Tu prueba de 30 días comienza hoy.',
    features: [
      'Pedidos online activos en tu menú',
      'Alerta WhatsApp al recibir pedido',
      'Notificaciones en tiempo real',
      'Personalización completa de marca',
    ],
    nextSteps: [
      'Sube tus productos y fotos',
      'Personaliza colores y logo',
      'Comparte tu código QR con clientes',
      'Activa WhatsApp en Módulos para alertas',
    ],
  },
  BASICO: {
    name: 'Básico',
    badge: 'PRUEBA 30 DÍAS',
    badgeColor: '#818cf8',
    badgeBg: 'rgba(129,140,248,0.14)',
    detail: 'Q299 / mes al vencer la prueba',
    subtitle: 'Tu plan Básico está activo.',
    features: [
      'Menú digital con QR listo para imprimir',
      'Hasta 30 productos en catálogo',
      'Logo y colores de tu marca',
      'Panel de administración completo',
    ],
    nextSteps: [
      'Sube tus productos y fotos',
      'Personaliza colores y logo',
      'Imprime o comparte tu código QR',
      'Actualiza a Premium para agregar pedidos online',
    ],
  },
} as const;

export default async function RegistroListoPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; plan?: string }>;
}) {
  const { slug, plan } = await searchParams;
  const safeSlug = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const safePlan = plan === 'BASICO' ? 'BASICO' : 'PREMIUM';
  const panelUrl = safeSlug ? adminUrl(safeSlug) : '/login';
  const menuUrl = safeSlug ? subdomainUrl(safeSlug) : '/';
  const info = PLAN_INFO[safePlan];

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

          {/* Ícono de éxito */}
          <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px', display: 'grid', placeItems: 'center', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
            <Icon name="checkCircle" size={32} />
          </div>

          <h1 className="t-display" style={{ fontSize: 26, lineHeight: 1.1 }}>¡Tu restaurante está en vivo!</h1>
          <p className="t-mute" style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 10 }}>
            {info.subtitle} Lo primero: entra a tu panel y personaliza tu menú.
          </p>

          {/* CTAs */}
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

          {/* Resumen del plan */}
          <Glass variant="quiet" style={{ marginTop: 22, padding: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)' }}>
                Plan {info.name}
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                background: info.badgeBg, color: info.badgeColor, letterSpacing: '0.05em',
              }}>
                {info.badge}
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {info.features.map((f) => (
                <li key={f} style={{ fontSize: 13, color: 'var(--u-text-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="check" size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
                  {f}
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 11, color: 'var(--u-text-4)', borderTop: '1px solid var(--u-hair)', paddingTop: 10 }}>
              {info.detail}
            </div>
          </Glass>

          {/* Primeros pasos */}
          <Glass variant="quiet" style={{ marginTop: 12, padding: '16px', textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Primeros pasos
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, counterReset: 'steps' }}>
              {info.nextSteps.map((step, i) => (
                <li key={step} style={{ fontSize: 13, color: 'var(--u-text-3)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 99, background: 'rgba(var(--brand-accent-rgb,99,102,241),0.12)', color: 'var(--brand-accent)', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Glass>

          {/* Ayuda para iniciar sesión */}
          <Glass variant="quiet" style={{ marginTop: 12, padding: '13px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, textAlign: 'left' }}>
            <Icon name="helpCircle" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
            Si te pide iniciar sesión, usa el correo y la contraseña que acabas de registrar.
          </Glass>
        </div>
      </div>
    </main>
  );
}
