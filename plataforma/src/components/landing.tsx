import Link from 'next/link';
import { Glass } from '@/components/glass';
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
  { n: '01', title: 'Creamos tu restaurante', body: 'Lo damos de alta y lo personalizamos a tu gusto: marca, colores y menú.' },
  { n: '02', title: 'Recibes tu acceso', body: 'Entras a tu panel y administras catálogo, precios y pedidos cuando quieras.' },
  { n: '03', title: 'Tus clientes escanean', body: 'El comensal abre tu menú desde un QR y, si activas Premium, ordena en línea.' },
];

const PLANS = [
  {
    code: 'Catálogo',
    tagline: 'Tu menú, vivo',
    points: ['Menú web interactivo por QR', 'Panel para gestionar el catálogo', 'Personalización de marca', 'Subdominio propio'],
    accent: false,
  },
  {
    code: 'Premium',
    tagline: 'Catálogo + pedidos',
    points: ['Todo lo de Catálogo', 'Carrito y checkout en línea', 'Pedidos para llevar / domicilio', 'Alerta en tiempo real + WhatsApp'],
    accent: true,
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
              padding: '7px 16px', borderRadius: 'var(--radius-full)',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            Acceder
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
            <a
              href={demoUrl}
              className="press btn-accent"
              style={{
                padding: '13px 26px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 15, textDecoration: 'none', color: '#fff',
              }}
            >
              Ver demo en vivo
            </a>
            <a
              href={ctaHref}
              className="press"
              style={{
                padding: '13px 26px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 15, textDecoration: 'none',
                color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              Solicita tu demo
            </a>
          </div>
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
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 26 }}>
            Planes
          </h2>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', maxWidth: 620, margin: '0 auto' }}>
            {PLANS.map((p) => (
              <Glass
                key={p.code}
                style={{
                  padding: '26px 22px',
                  border: p.accent ? '1px solid color-mix(in srgb, var(--brand-accent) 55%, transparent)' : undefined,
                }}
              >
                {p.accent && (
                  <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--brand-accent)', marginBottom: 10 }}>
                    Más popular
                  </div>
                )}
                <h3 className="t-display" style={{ fontSize: 22, fontWeight: 800 }}>{p.code}</h3>
                <p className="t-mute" style={{ fontSize: 13.5, marginTop: 4 }}>{p.tagline}</p>
                <ul style={{ listStyle: 'none', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {p.points.map((pt) => (
                    <li key={pt} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                      <span style={{ color: 'var(--brand-accent)', flex: '0 0 auto', lineHeight: 1.5 }}>✓</span>
                      <span style={{ color: 'var(--u-text-2)', lineHeight: 1.5 }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </Glass>
            ))}
          </div>
        </section>

        {/* ── CTA final ─────────────────────────────────────── */}
        <section style={{ marginTop: 56 }}>
          <Glass variant="solid" style={{ padding: '36px 24px', textAlign: 'center' }}>
            <h2 className="t-display" style={{ fontSize: 'var(--fs-display)' }}>
              ¿Listo para modernizar tu menú?
            </h2>
            <p className="t-mute" style={{ fontSize: 15, maxWidth: 440, margin: '12px auto 0', lineHeight: 1.5 }}>
              Te montamos una demo con tu marca para que la veas funcionando antes de decidir.
            </p>
            <a
              href={ctaHref}
              className="press btn-accent"
              style={{
                display: 'inline-block', marginTop: 22,
                padding: '14px 30px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 15, textDecoration: 'none', color: '#fff',
              }}
            >
              Solicita tu demo
            </a>
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
