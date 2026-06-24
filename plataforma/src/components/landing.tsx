import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { subdomainUrl, DEMO_SLUG } from '@/lib/tenant';

/* ── Contacto (configurable por env; cae a valores por defecto) ──────────
   Define NEXT_PUBLIC_CONTACT_WHATSAPP (ej. "50212345678") para que el CTA
   abra WhatsApp. Si no, usa el correo de NEXT_PUBLIC_CONTACT_EMAIL.        */
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';
const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP; // solo dígitos, con código de país

const FEATURES = [
  {
    title: 'Personalización total',
    body: 'Colores, logo, fondo y estilo glass únicos por restaurante. Cada cliente se siente único.',
  },
  {
    title: 'Panel para el dueño',
    body: 'El restaurante gestiona su propio menú: precios, fotos, disponibilidad. Sin depender de nadie.',
  },
  {
    title: 'Pedidos en tiempo real',
    body: 'Carrito, checkout y alerta instantánea (sonido + visual) con aviso automático a WhatsApp.',
  },
  {
    title: 'Carga instantánea por QR',
    body: 'Menú web renderizado en servidor: abre al toque, sin apps, sin PDFs lentos.',
  },
];

const STEPS = [
  { n: '01', title: 'Regístrate en minutos', body: 'Crea tu cuenta y tu restaurante queda en vivo al instante. Sin tarjeta, 1 mes gratis.' },
  { n: '02', title: 'Personalízalo, guiado', body: 'Colores, logo y tu primer menú con un asistente paso a paso. No necesitas saber de tecnología.' },
  { n: '03', title: 'Comparte tu QR', body: 'Tus clientes escanean, ven tu menú y ordenan en línea. Tú recibes los pedidos en tiempo real.' },
];

const LANDING_PLANS = [
  {
    code: 'Básico',
    price: 'Q299 / mes',
    tagline: 'Menú digital sin pedidos online',
    points: ['Menú web por QR', 'Hasta 30 productos', 'Personalización con tu logo y color', 'QR listo para imprimir'],
    accent: false,
    cta: 'self' as const,
  },
  {
    code: 'Premium',
    price: 'Q600 / mes',
    tagline: 'Pedidos online, tiempo real y personalización completa',
    points: ['Carrito y checkout en línea', 'Alerta en tiempo real + WhatsApp', 'Todos los módulos disponibles', 'Hasta Q20,000 en ventas / mes'],
    accent: true,
    badge: 'MÁS POPULAR',
    cta: 'self' as const,
  },
  {
    code: 'Premium Pro',
    price: 'Q1,000 / mes',
    tagline: 'Para mayor flujo de pedidos',
    points: ['Todo lo del plan Premium', 'Hasta Q40,000 en ventas / mes', 'Proveedores y recetas incluidos', '5 usuarios del panel'],
    accent: false,
    cta: 'self' as const,
  },
];

export default function LeoginLanding() {
  const demoUrl = subdomainUrl(DEMO_SLUG);
  const ctaHref = CONTACT_WA
    ? `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent('Hola, quiero una demo de Leogin para mi restaurante')}`
    : `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero una demo de Leogin')}`;

  return (
    <div style={{ width: '100%' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ flex: '0 0 auto' }}>
          <LeoginLogo size={26} />
        </span>
        <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <a href="#planes" className="press t-mute" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Planes
          </a>
          <Link
            href="/login"
            className="press"
            style={{
              padding: '7px 14px', borderRadius: 'var(--radius-full)',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            Acceder
          </Link>
          <Link
            href="/registro"
            className="press btn-accent"
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-full)',
              fontSize: 13, fontWeight: 700, textDecoration: 'none', color: '#fff',
            }}
          >
            Crear mi restaurante
          </Link>
        </nav>
      </header>

      <main className="anim-fade-up" style={{ maxWidth: 960, margin: '0 auto', padding: '16px 18px 72px' }}>
        {/* ── Hero ──────────────────────────────────────────── */}
        <section style={{ position: 'relative', textAlign: 'center', padding: '56px 8px 36px' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: '-20px -20px auto', height: 320,
              background: 'radial-gradient(60% 70% at 50% 0%, color-mix(in srgb, var(--brand-accent) 24%, transparent), transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div className="t-kicker" style={{ fontSize: 11, marginBottom: 18 }}>
            Menús digitales para restaurantes
          </div>
          <h1 className="t-display" style={{ fontSize: 'var(--fs-display-xl)', maxWidth: 560, margin: '0 auto' }}>
            El menú de tu restaurante, vivo.
          </h1>
          <p className="t-mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 520, margin: '18px auto 0' }}>
            Cambia el QR que lleva a un PDF lento por un menú web rápido y espectacular,
            con su propio panel de administración y pedidos en línea opcionales.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            <Link
              href="/registro"
              className="press btn-accent"
              style={{
                padding: '13px 26px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 15, textDecoration: 'none', color: '#fff',
              }}
            >
              Crear mi restaurante
            </Link>
            <a
              href={demoUrl}
              className="press"
              style={{
                padding: '13px 26px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 15, textDecoration: 'none',
                color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              Ver demo en vivo
            </a>
          </div>
          <p className="t-mute" style={{ fontSize: 13, marginTop: 14 }}>
            1 mes de prueba gratis · sin tarjeta · listo en minutos
          </p>
        </section>

        {/* ── Features ──────────────────────────────────────── */}
        <section
          style={{
            display: 'grid', gap: 14, marginTop: 24,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          {FEATURES.map((f) => (
            <Glass key={f.title} style={{ padding: '20px 18px' }}>
              <h3 className="t-display" style={{ fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
              <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>{f.body}</p>
            </Glass>
          ))}
        </section>

        {/* ── Cómo funciona ─────────────────────────────────── */}
        <section style={{ marginTop: 56 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Cómo funciona
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            De cero a tu menú en línea, sin que toques una línea de código.
          </p>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {STEPS.map((s) => (
              <Glass key={s.n} variant="quiet" style={{ padding: '22px 18px' }}>
                <div className="t-mono" style={{ fontSize: 13, color: 'var(--brand-accent)', fontWeight: 600 }}>{s.n}</div>
                <h3 className="t-display" style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{s.title}</h3>
                <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>{s.body}</p>
              </Glass>
            ))}
          </div>
        </section>

        {/* ── Planes ────────────────────────────────────────── */}
        <section id="planes" style={{ marginTop: 56, scrollMarginTop: 72 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Planes y precios
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            El precio crece con tus ventas. Sin cobros sorpresa.
          </p>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {LANDING_PLANS.map((p) => (
              <Glass
                key={p.code}
                style={{
                  padding: '24px 20px',
                  border: p.accent ? '1.5px solid color-mix(in srgb, var(--brand-accent) 60%, transparent)' : undefined,
                  position: 'relative',
                }}
              >
                {'badge' in p && p.badge && (
                  <div className="t-kicker" style={{ fontSize: 9, color: 'var(--brand-accent)', marginBottom: 10, letterSpacing: '0.08em' }}>
                    {p.badge}
                  </div>
                )}
                <h3 className="t-display" style={{ fontSize: 20, fontWeight: 800 }}>{p.code}</h3>
                <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--brand-accent)', marginTop: 4 }}>{p.price}</div>
                <p className="t-mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>{p.tagline}</p>
                <ul style={{ listStyle: 'none', margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {p.points.map((pt) => (
                    <li key={pt} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5 }}>
                      <Icon name="check" size={15} strokeWidth={2.6} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ color: 'var(--u-text-2)', lineHeight: 1.45 }}>{pt}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/registro"
                  className="press btn-accent"
                  style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 13.5, textDecoration: 'none', color: '#fff' }}
                >
                  Empezar gratis
                </Link>
              </Glass>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Link
              href="/planes"
              className="t-mute"
              style={{ fontSize: 13.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--u-text-3)' }}
            >
              Ver todos los planes (hasta Q150,000 GMV) y comparativa completa
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </section>

        {/* ── CTA final ─────────────────────────────────────── */}
        <section style={{ marginTop: 56 }}>
          <Glass variant="solid" style={{ padding: '36px 24px', textAlign: 'center' }}>
            <h2 className="t-display" style={{ fontSize: 'var(--fs-display)' }}>
              ¿Listo para modernizar tu menú?
            </h2>
            <p className="t-mute" style={{ fontSize: 15, maxWidth: 440, margin: '12px auto 0', lineHeight: 1.5 }}>
              Crea tu restaurante ahora y pruébalo gratis 1 mes completo. ¿Prefieres que te acompañemos? Escríbenos.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
              <Link
                href="/registro"
                className="press btn-accent"
                style={{
                  display: 'inline-block',
                  padding: '14px 30px', borderRadius: 'var(--radius-full)',
                  fontWeight: 700, fontSize: 15, textDecoration: 'none', color: '#fff',
                }}
              >
                Crear mi restaurante
              </Link>
              <a
                href={ctaHref}
                className="press"
                style={{
                  display: 'inline-block',
                  padding: '14px 30px', borderRadius: 'var(--radius-full)',
                  fontWeight: 600, fontSize: 15, textDecoration: 'none',
                  color: 'var(--u-text)', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)',
                }}
              >
                Hablar con ventas
              </a>
            </div>
          </Glass>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--u-hair)', padding: '24px 18px' }}>
        <div
          style={{
            maxWidth: 960, margin: '0 auto',
            display: 'flex', flexWrap: 'wrap', gap: 12,
            alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <LeoginLogo size={20} />
          <span className="t-mute" style={{ fontSize: 12.5 }}>
            © {new Date().getFullYear()} Leogin · Menús interactivos para restaurantes
          </span>
        </div>
      </footer>
    </div>
  );
}
