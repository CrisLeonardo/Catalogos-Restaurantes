import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { subdomainUrl, rootDomainForUrls, DEMO_SLUG } from '@/lib/tenant';
import { PLANS, PUBLIC_PLANS, planPriceQ, type PlanCode, type PlanPricing } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';

/* ── Contacto (configurable por env; cae a valores por defecto) ──────────
   Define NEXT_PUBLIC_CONTACT_WHATSAPP (ej. "50212345678") para que el CTA
   abra WhatsApp. Si no, usa el correo de NEXT_PUBLIC_CONTACT_EMAIL.        */
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';
const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP; // solo dígitos, con código de país

/* Beneficios para el dueño y para el comensal. */
const FOR_OWNER = [
  { icon: 'bell',     title: 'Pedidos en tiempo real', body: 'Cada pedido suena y aparece al instante en tu panel y cocina. Nada se te escapa.' },
  { icon: 'chart',    title: 'Sabes qué se vende',      body: 'Ventas, horas pico, platos estrella y ticket promedio. Decide con datos, no a ciegas.' },
  { icon: 'wallet',   title: 'Control de tu dinero',    body: 'Costos, margen por plato, corte de caja y reportes exportables. Tu negocio claro.' },
  { icon: 'sparkle',  title: 'Tu marca, no la nuestra', body: 'Colores, logo, fotos y estilo propios. Tus clientes ven tu restaurante, no “otra app”.' },
];
const FOR_DINER = [
  { icon: 'grid',     title: 'Abre con un QR',          body: 'Escanea y ve el menú al instante. Sin descargar apps, sin PDFs lentos.' },
  { icon: 'bag',      title: 'Ordena en segundos',      body: 'Para llevar, a domicilio o desde la mesa. Con fotos que dan ganas de pedir.' },
  { icon: 'truck',    title: 'Sigue su pedido',         body: 'El cliente ve el estado en vivo y recibe aviso cuando está listo.' },
  { icon: 'star',     title: 'Vuelve por más',          body: 'Puntos de lealtad y cupones que convierten una visita en un cliente fiel.' },
];

/* Catálogo completo de capacidades (muestra la amplitud del sistema). */
const CAPABILITIES = [
  { icon: 'bag',      label: 'Menú digital QR' },
  { icon: 'truck',    label: 'Pedidos a domicilio' },
  { icon: 'grid',     label: 'Comer en local (mesa)' },
  { icon: 'list',     label: 'Pedidos para llevar' },
  { icon: 'flame',    label: 'Pantalla de cocina (KDS)' },
  { icon: 'userPlus', label: 'Panel de mesero' },
  { icon: 'print',    label: 'Impresión de comandas' },
  { icon: 'star',     label: 'Programa de lealtad' },
  { icon: 'ticket',   label: 'Cupones y descuentos' },
  { icon: 'calendar', label: 'Reservaciones' },
  { icon: 'box',      label: 'Inventario y stock' },
  { icon: 'chart',    label: 'Analítica avanzada' },
  { icon: 'wallet',   label: 'Finanzas y caja' },
  { icon: 'receipt',  label: 'Factura electrónica (FEL)' },
  { icon: 'users',    label: 'Usuarios con roles' },
  { icon: 'dashboard',label: 'Multisucursal' },
];

const steps = (trialDays: number) => [
  { n: '01', title: 'Regístrate en minutos', body: `Crea tu cuenta y tu restaurante queda en vivo al instante. Sin tarjeta, ${trialDays} días gratis.` },
  { n: '02', title: 'Personalízalo, guiado', body: 'Colores, logo y tu primer menú con un asistente paso a paso. No necesitas saber de tecnología.' },
  { n: '03', title: 'Comparte tu QR',        body: 'Tus clientes escanean, ven tu menú y ordenan en línea. Tú recibes los pedidos en tiempo real.' },
];

/* Puntos de marketing por plan (los precios y el badge SIEMPRE salen de plans.ts,
   fuente única de verdad — solo este texto descriptivo se cura a mano aquí). */
const LANDING_PLAN_POINTS: Record<PlanCode, string[]> = {
  BASICO: ['Menú digital con código QR', 'Gratis para siempre, hasta 150 productos', 'Personalización con logo y color', 'Sin pedidos en línea'],
  ESTANDAR: ['Todo lo del plan Básico', 'Pedidos para llevar o a domicilio', 'Alertas en tiempo real + WhatsApp', 'Nunca un % de tus ventas'],
  PREMIUM: ['Para llevar, en local y a domicilio', 'Panel de mesero y mapa de mesas', 'Lealtad, cupones y reservaciones', 'Finanzas, inventario y analítica'],
  PRO: [],
};

/* Los precios salen del PlanPricing vigente (overrides del super admin),
   no del default de plans.ts — por eso esto es función y no constante. */
function landingPlans(pricing: PlanPricing) {
  return PUBLIC_PLANS.map((code) => ({
    code,
    name: PLANS[code].name,
    price: pricing.prices[code] === 0 ? 'Gratis' : planPriceQ(pricing, code),
    isFree: pricing.prices[code] === 0,
    tagline: PLANS[code].tagline,
    points: LANDING_PLAN_POINTS[code],
    accent: PLANS[code].highlight,
    badge: PLANS[code].badge,
  }));
}

const FAQS = [
  { q: '¿Necesito saber de tecnología?', a: 'No. Te guiamos paso a paso y en minutos tienes tu menú en vivo. Si prefieres, lo configuramos por ti.' },
  { q: '¿Cobran comisión por cada pedido?', a: 'No. Pagas una mensualidad fija según tu plan. Lo que vendes es tuyo, sin comisiones por pedido.' },
  { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Todo abre con el QR en el navegador del celular, al instante. Opcionalmente pueden “instalarlo” como app.' },
  { q: '¿Puedo cambiar de plan después?', a: 'Sí, cuando quieras. Empiezas en el plan que más te convenga y subes a medida que creces.' },
  { q: '¿Y si no hago domicilio o solo atiendo en local?', a: 'Con “Plan a tu medida” pagas solo por los canales que usas: cada canal que no necesites baja tu mensualidad.' },
  { q: '¿Sirve si tengo varias sucursales?', a: 'Sí. Cada sucursal tiene su menú y QR, y tú ves todo consolidado en un panel de grupo.' },
];

/* Datos estructurados (JSON-LD): ficha de producto + FAQ para que Google
   entienda qué es Leogin, muestre precios y despliegue las preguntas
   frecuentes como rich results en la búsqueda. */
function structuredData(pricing: PlanPricing) {
  const root = rootDomainForUrls();
  const isLocal = root.includes('localhost') || root.startsWith('127.');
  const url = `${isLocal ? 'http' : 'https'}://${root}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Leogin',
      url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Plataforma de menús digitales QR para restaurantes con pedidos en línea, panel de administración, cocina (KDS) y programa de lealtad. Hecha en Guatemala.',
      inLanguage: 'es',
      offers: PUBLIC_PLANS.map((code) => ({
        '@type': 'Offer',
        name: `Plan ${PLANS[code].name}`,
        price: pricing.prices[code],
        priceCurrency: 'GTQ',
        category: 'subscription',
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];
}

export default async function LeoginLanding() {
  const pricing = await getEffectivePlanPricing();
  const demoUrl = subdomainUrl(DEMO_SLUG);
  const ctaHref = CONTACT_WA
    ? `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent('Hola, quiero una demo de Leogin para mi restaurante')}`
    : `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero una demo de Leogin')}`;

  return (
    <div style={{ width: '100%' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(pricing)) }}
      />
      {/* ── Header ──────────────────────────────────────────── */}
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 58, padding: '0 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ flex: '0 0 auto' }}>
          <LeoginLogo size={26} />
        </span>
        <nav aria-label="Navegación principal" style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <a href="#funciones" className="press t-mute lp-nav-section" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Funciones
          </a>
          <a href="#planes" className="press t-mute lp-nav-section" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Planes
          </a>
          <a href={demoUrl} className="press t-mute lp-nav-section" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Demo
          </a>
          <Link href="/descargas" className="press t-mute lp-nav-section" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Escritorio
          </Link>
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

      <main className="anim-fade-up" style={{ maxWidth: 1040, margin: '0 auto', padding: '8px 18px 80px' }}>
        {/* ── Hero ──────────────────────────────────────────── */}
        <section style={{ position: 'relative', textAlign: 'center', padding: '60px 8px 40px' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: '-20px -20px auto', height: 360,
              background: 'radial-gradient(60% 70% at 50% 0%, color-mix(in srgb, var(--brand-accent) 26%, transparent), transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div className="t-kicker" style={{ fontSize: 11, marginBottom: 18 }}>
            La plataforma de menús digitales para restaurantes
          </div>
          <h1 className="t-display" style={{ fontSize: 'var(--fs-display-xl)', maxWidth: 680, margin: '0 auto', lineHeight: 1.05 }}>
            El menú de tu restaurante, <span style={{ color: 'var(--brand-accent)' }}>vivo</span>.
          </h1>
          <p className="t-mute" style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 560, margin: '20px auto 0' }}>
            Cambia el QR que lleva a un PDF lento por un menú web rápido y espectacular —
            con pedidos en línea, panel de administración y todo lo que tu negocio necesita.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <Link
              href="/registro"
              className="press btn-accent"
              style={{
                padding: '14px 28px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 15.5, textDecoration: 'none', color: '#fff',
              }}
            >
              Crear mi restaurante gratis
            </Link>
            <a
              href={demoUrl}
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 26px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 15.5, textDecoration: 'none',
                color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="grid" size={16} /> Ver demo en vivo
            </a>
          </div>
          <p className="t-mute" style={{ fontSize: 13, marginTop: 16 }}>
            {pricing.trialDays} días de prueba gratis · sin tarjeta · sin comisiones por pedido
          </p>

          {/* Tira de confianza */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 34 }}>
            {[
              { icon: 'bell',   label: 'Pedidos en tiempo real' },
              { icon: 'wallet', label: 'Sin comisión por pedido' },
              { icon: 'grid',   label: 'Sin apps que descargar' },
              { icon: 'sparkle',label: 'Con tu propia marca' },
            ].map((c) => (
              <span key={c.label} className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 99, fontSize: 12.5, color: 'var(--u-text-2)' }}>
                <Icon name={c.icon} size={14} style={{ color: 'var(--brand-accent)' }} /> {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── Vistazo al producto (mockup) ─────────────────── */}
        <section style={{ marginTop: 44 }}>
          <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'center' }}>
            <div>
              <div className="t-kicker" style={{ fontSize: 10, color: 'var(--brand-accent)', marginBottom: 10 }}>Un vistazo</div>
              <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.1 }}>
                Así de bien se ve tu menú
              </h2>
              <p className="t-mute" style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, maxWidth: 420 }}>
                Fotos que dan hambre, tu marca y un botón para ordenar. Tus clientes lo abren
                con el QR, sin instalar nada.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                {['🇬🇹 Hecho en Guatemala', 'Soporte real por WhatsApp', 'Listo el mismo día'].map((t) => (
                  <span key={t} className="glass-quiet" style={{ fontSize: 12, color: 'var(--u-text-2)', padding: '7px 13px', borderRadius: 99 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PhoneMockup />
            </div>
          </div>
        </section>

        {/* ── Antes / Después ──────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <Glass variant="quiet" style={{ padding: '22px 20px' }}>
              <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--u-text-4)' }}>Antes</div>
              <h3 className="t-display" style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>Un PDF lento y plano</h3>
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Tarda en abrir y se ve mal en el celular', 'Sin pedidos: el cliente llama o se va', 'Cambiar un precio es un dolor de cabeza'].map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--u-text-3)' }}>
                    <Icon name="x" size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} /> {t}
                  </li>
                ))}
              </ul>
            </Glass>
            <Glass style={{ padding: '22px 20px', border: '1.5px solid color-mix(in srgb, var(--brand-accent) 45%, transparent)' }}>
              <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--brand-accent)' }}>Con Leogin</div>
              <h3 className="t-display" style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>Un menú vivo que vende</h3>
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Abre al toque, con fotos que dan hambre', 'Pedidos en línea que llegan en tiempo real', 'Tú editas precios y fotos cuando quieras'].map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--u-text-2)' }}>
                    <Icon name="check" size={15} strokeWidth={2.6} style={{ color: '#4ade80', flexShrink: 0, marginTop: 2 }} /> {t}
                  </li>
                ))}
              </ul>
            </Glass>
          </div>
        </section>

        {/* ── Funciones por beneficio ───────────────────────── */}
        <section id="funciones" style={{ marginTop: 64, scrollMarginTop: 72 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Hecho para vender más y operar mejor
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14.5, marginBottom: 30, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            Una experiencia que enamora a tus clientes y un panel que te da el control total de tu restaurante.
          </p>

          <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <div>
              <div className="t-kicker" style={{ fontSize: 10, color: 'var(--brand-accent)', marginBottom: 12 }}>Para tus clientes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {FOR_DINER.map((f) => <FeatureRow key={f.title} {...f} />)}
              </div>
            </div>
            <div>
              <div className="t-kicker" style={{ fontSize: 10, color: 'var(--brand-accent)', marginBottom: 12 }}>Para ti, el dueño</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {FOR_OWNER.map((f) => <FeatureRow key={f.title} {...f} />)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Tu centro de control (mockup del panel) ───────── */}
        <section style={{ marginTop: 64 }}>
          <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', order: 0 }}>
              <PanelMockup />
            </div>
            <div>
              <div className="t-kicker" style={{ fontSize: 10, color: 'var(--brand-accent)', marginBottom: 10 }}>Tu centro de control</div>
              <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.1 }}>
                Un panel que trabaja contigo
              </h2>
              <p className="t-mute" style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, maxWidth: 440 }}>
                Cada pedido suena y aparece al instante. La cocina lo ve en su pantalla,
                la comanda se imprime sola y al final del día tienes tu corte de caja
                y tus números claros — incluso si se va el internet.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                {['Pedidos con sonido', 'Pantalla de cocina', 'Corte de caja', 'Aguanta sin internet'].map((t) => (
                  <span key={t} className="glass-quiet" style={{ fontSize: 12, color: 'var(--u-text-2)', padding: '7px 13px', borderRadius: 99 }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Todo en un solo lugar ─────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Todo tu restaurante, en un solo lugar
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            Activa lo que necesites según tu plan. Crece sin cambiar de sistema.
          </p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {CAPABILITIES.map((c) => (
              <div key={c.label} className="glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 13 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(var(--brand-accent-rgb,99,102,241),0.1)', color: 'var(--brand-accent)' }}>
                  <Icon name={c.icon} size={16} />
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', lineHeight: 1.25 }}>{c.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Cómo funciona ─────────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            De cero a tu menú en línea
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            Sin que toques una línea de código.
          </p>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {steps(pricing.trialDays).map((s) => (
              <Glass key={s.n} variant="quiet" style={{ padding: '24px 20px' }}>
                <div className="t-mono" style={{ fontSize: 13, color: 'var(--brand-accent)', fontWeight: 700 }}>{s.n}</div>
                <h3 className="t-display" style={{ fontSize: 16.5, fontWeight: 700, marginTop: 10 }}>{s.title}</h3>
                <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{s.body}</p>
              </Glass>
            ))}
          </div>
        </section>

        {/* ── Planes ────────────────────────────────────────── */}
        <section id="planes" style={{ marginTop: 64, scrollMarginTop: 72 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Planes claros, sin sorpresas
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            Empieza gratis. Sin comisiones por pedido. Cancela cuando quieras.
          </p>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', alignItems: 'start' }}>
            {landingPlans(pricing).map((p) => (
              <Glass
                key={p.code}
                style={{
                  padding: '26px 22px',
                  border: p.accent ? '1.5px solid color-mix(in srgb, var(--brand-accent) 60%, transparent)' : undefined,
                  position: 'relative',
                  boxShadow: p.accent ? '0 12px 40px color-mix(in srgb, var(--brand-accent) 18%, transparent)' : undefined,
                }}
              >
                {'badge' in p && p.badge && (
                  <div className="t-kicker" style={{ fontSize: 9, color: 'var(--brand-accent)', marginBottom: 10, letterSpacing: '0.08em' }}>
                    {p.badge}
                  </div>
                )}
                <h3 className="t-display" style={{ fontSize: 21, fontWeight: 800 }}>{p.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
                  <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 30, color: 'var(--brand-accent)' }}>{p.price}</span>
                  {!p.isFree && <span className="t-mute" style={{ fontSize: 13 }}>/ mes</span>}
                </div>
                <p className="t-mute" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>{p.tagline}</p>
                <ul style={{ listStyle: 'none', margin: '16px 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {p.points.map((pt) => (
                    <li key={pt} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5 }}>
                      <Icon name="check" size={15} strokeWidth={2.6} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ color: 'var(--u-text-2)', lineHeight: 1.45 }}>{pt}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/registro"
                  className={p.accent ? 'press btn-accent' : 'press'}
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px', borderRadius: 'var(--radius-full)',
                    fontWeight: 700, fontSize: 14, textDecoration: 'none',
                    color: p.accent ? '#fff' : 'var(--u-text)',
                    border: p.accent ? 'none' : '1px solid var(--u-hair-2)',
                    background: p.accent ? undefined : 'rgba(255,255,255,0.06)',
                  }}
                >
                  Empezar gratis
                </Link>
              </Glass>
            ))}
          </div>

          {/* Plan a tu medida */}
          <Glass variant="quiet" style={{ marginTop: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
              <Icon name="sparkle" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)' }}>Plan a tu medida</div>
              <div className="t-mute" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.45 }}>
                ¿No haces domicilio o solo atiendes en local? Pagas solo por los canales que usas — cada canal que no necesites baja tu mensualidad.
              </div>
            </div>
          </Glass>

          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Link
              href="/planes"
              className="t-mute"
              style={{ fontSize: 13.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--u-text-3)' }}
            >
              Ver todos los planes y comparativa completa
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </section>

        {/* ── Preguntas frecuentes ──────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 26 }}>
            Preguntas frecuentes
          </h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 880, margin: '0 auto' }}>
            {FAQS.map((f) => (
              <Glass key={f.q} variant="quiet" style={{ padding: '18px 18px' }}>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="helpCircle" size={16} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 1 }} />
                  {f.q}
                </h3>
                <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8, paddingLeft: 24 }}>{f.a}</p>
              </Glass>
            ))}
          </div>
        </section>

        {/* ── CTA final ─────────────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <Glass variant="solid" style={{ padding: '40px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 'auto -20px -40px', height: 220,
                background: 'radial-gradient(60% 80% at 50% 100%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', position: 'relative' }}>
              Moderniza tu restaurante hoy
            </h2>
            <p className="t-mute" style={{ fontSize: 15, maxWidth: 480, margin: '12px auto 0', lineHeight: 1.55, position: 'relative' }}>
              Crea tu restaurante ahora y pruébalo gratis {pricing.trialDays} días. ¿Prefieres que te acompañemos? Escríbenos por WhatsApp.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24, position: 'relative' }}>
              <Link
                href="/registro"
                className="press btn-accent"
                style={{
                  display: 'inline-block',
                  padding: '14px 30px', borderRadius: 'var(--radius-full)',
                  fontWeight: 700, fontSize: 15, textDecoration: 'none', color: '#fff',
                }}
              >
                Crear mi restaurante gratis
              </Link>
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 28px', borderRadius: 'var(--radius-full)',
                  fontWeight: 600, fontSize: 15, textDecoration: 'none',
                  color: 'var(--u-text)', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)',
                }}
              >
                <Icon name="whatsapp" size={16} style={{ color: '#4ade80' }} /> Hablar con ventas
              </a>
            </div>
          </Glass>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--u-hair)', padding: '28px 18px' }}>
        <div
          style={{
            maxWidth: 1040, margin: '0 auto',
            display: 'flex', flexWrap: 'wrap', gap: 16,
            alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <LeoginLogo size={22} />
            <span className="t-mute" style={{ fontSize: 12.5 }}>
              Menús interactivos para restaurantes
            </span>
          </div>
          <nav aria-label="Enlaces del pie" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="#funciones" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Funciones</a>
            <Link href="/planes" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Planes</Link>
            <a href={demoUrl} className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Demo</a>
            <Link href="/descargas" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Escritorio</Link>
            <Link href="/terminos" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Términos</Link>
            <Link href="/privacidad" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Privacidad</Link>
            <a href={ctaHref} target="_blank" rel="noopener noreferrer" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Contacto</a>
          </nav>
        </div>
        <div style={{ maxWidth: 1040, margin: '16px auto 0' }}>
          <span className="t-mute" style={{ fontSize: 12 }}>
            © {new Date().getFullYear()} Leogin · Todos los derechos reservados
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ── Fila de característica con ícono ─────────────────────────── */
function FeatureRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Glass variant="quiet" style={{ padding: '16px 16px', display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(var(--brand-accent-rgb,99,102,241),0.1)', color: 'var(--brand-accent)' }}>
        <Icon name={icon} size={19} />
      </span>
      <div>
        <h3 className="t-display" style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
        <p className="t-mute" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{body}</p>
      </div>
    </Glass>
  );
}

/* ── Mockup del panel de administración (CSS puro, sin imágenes) ── */
function PanelMockup() {
  const kpis = [
    { label: 'Ventas hoy', value: 'Q1,240' },
    { label: 'Pedidos', value: '32' },
    { label: 'Ticket prom.', value: 'Q39' },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <div aria-hidden style={{ position: 'absolute', inset: -30, background: 'radial-gradient(50% 50% at 50% 45%, color-mix(in srgb, var(--brand-accent) 18%, transparent), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', borderRadius: 18, padding: 9, background: 'linear-gradient(160deg,#2a2a2e,#161618)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 30px 70px rgba(0,0,0,0.45)' }}>
        <div style={{ borderRadius: 11, overflow: 'hidden', background: '#0c0c0e' }}>
          {/* Barra de ventana */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['#f87171', '#fbbf24', '#4ade80'].map((c) => (
              <span key={c} style={{ width: 8, height: 8, borderRadius: 99, background: c, opacity: 0.85 }} />
            ))}
            <span style={{ fontSize: 10, color: 'rgba(245,243,239,0.5)', marginLeft: 8, fontWeight: 600 }}>Pedidos en vivo</span>
            <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.14)', padding: '3px 8px', borderRadius: 99 }}>● EN VIVO</span>
          </div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, padding: '11px 12px 0' }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: 'rgba(255,255,255,0.045)', borderRadius: 9, padding: '8px 9px' }}>
                <div style={{ fontSize: 8, color: 'rgba(245,243,239,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#F5F3EF', marginTop: 3, fontFamily: 'var(--ui-font-mono)' }}>{k.value}</div>
              </div>
            ))}
          </div>
          {/* Pedido entrante */}
          <div style={{ margin: '11px 12px', background: 'rgba(255,255,255,0.045)', border: '1px solid color-mix(in srgb, var(--brand-accent) 45%, transparent)', borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'var(--brand-accent)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>NUEVO</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F5F3EF' }}>Mesa 4 · #128</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(245,243,239,0.5)' }}>hace 12 s</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(245,243,239,0.72)', marginTop: 7, lineHeight: 1.6 }}>
              2× Tacos al pastor · 1× Burrito de res<br />1× Agua de horchata
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-accent)', fontFamily: 'var(--ui-font-mono)' }}>Q142</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: '#0b0b0c', background: '#F5F3EF', padding: '5px 11px', borderRadius: 99 }}>Aceptar</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(245,243,239,0.75)', border: '1px solid rgba(255,255,255,0.18)', padding: '5px 11px', borderRadius: 99 }}>Imprimir</span>
            </div>
          </div>
          {/* Pedido en preparación */}
          <div style={{ margin: '0 12px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 11, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.13)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>EN COCINA</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(245,243,239,0.8)' }}>Para llevar · #127</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(245,243,239,0.5)', fontFamily: 'var(--ui-font-mono)' }}>08:41</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mockup del menú en un teléfono (CSS puro, sin imágenes) ──── */
function PhoneMockup() {
  const items = [
    { name: 'Tacos al pastor', desc: 'Con piña, cilantro y cebolla', price: 'Q45', g: 'linear-gradient(135deg,#d97706,#b45309)' },
    { name: 'Burrito de res',  desc: 'Frijol, arroz, queso y pico',  price: 'Q52', g: 'linear-gradient(135deg,#65a30d,#3f6212)' },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', inset: -30, background: 'radial-gradient(50% 50% at 50% 40%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: 268, borderRadius: 38, padding: 10, background: 'linear-gradient(160deg,#2a2a2e,#161618)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 30px 70px rgba(0,0,0,0.45)' }}>
        <div style={{ borderRadius: 30, overflow: 'hidden', background: 'var(--brand-bg, #0c0c0e)', aspectRatio: '9 / 19' }}>
          {/* Portada */}
          <div style={{ padding: '16px 16px 12px', background: 'linear-gradient(180deg, color-mix(in srgb, var(--brand-accent) 16%, transparent), transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--u-text, #fff)' }}>Tu Restaurante</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '3px 8px', borderRadius: 99 }}>● Abierto</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3, #aaa)', marginTop: 3 }}>Cocina de la casa · Zona 1</div>
          </div>
          {/* Productos */}
          <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => (
              <div key={it.name} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 8 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: it.g }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text, #fff)' }}>{it.name}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--u-text-3, #999)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.desc}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-accent)', marginTop: 3 }}>{it.price}</div>
                </div>
                <span aria-hidden style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--brand-accent)', color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</span>
              </div>
            ))}
          </div>
          {/* Barra de carrito */}
          <div style={{ margin: '14px 12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--brand-accent)', color: '#fff', borderRadius: 12, padding: '10px 14px' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Ver carrito</span>
              <span style={{ fontSize: 11.5, fontWeight: 800 }}>Q97</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
