import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { SiteHeader, SiteFooter, SectionHead, contactHref } from '@/components/site-chrome';
import { subdomainUrl, rootDomainForUrls, DEMO_SLUG } from '@/lib/tenant';
import { PLANS, PLAN_POINTS, PUBLIC_PLANS, planPriceQ, type PlanPricing } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { getLandingProof } from '@/lib/db/landing';
import { LandingPhone, Testimonials } from '@/components/landing-proof';
import { LandingIntro } from '@/components/landing-intro';
import { LandingDisenos } from '@/components/landing-disenos';
import { Leo } from '@/components/leo';
import { LandingDemo } from '@/components/landing-demo';
import QRCode from 'qrcode';
import { BUILTIN_TEMPLATES } from '@/lib/theme/templates';
import { disenosDeLaPortada } from '@/lib/landing-disenos';

/* Cifras de la tira de confianza. Solo hechos verificables del producto —
   nada de "+200 restaurantes" ni promedios inventados.

   Cada cifra es algo que el dueño siente en el bolsillo o en el día. La
   tercera era «7 herramientas incluidas en Premium», un número de catálogo
   que a quien no conoce el producto no le dice nada (auditoría de
   experiencia 2026-10-27, EV-10). */
const PROOF = [
  { value: 'Q0',  label: 'El plan Básico es gratis para siempre' },
  { value: '0 %', label: 'De comisión sobre lo que vendes' },
  { value: '0',   label: 'Apps que tus clientes tienen que descargar' },
  { value: 'Hoy', label: 'Tu menú puede quedar en vivo el mismo día' },
];

/* Beneficios para el dueño y para el comensal. */
const FOR_OWNER = [
  { icon: 'bell',    title: 'Los pedidos no se te escapan', body: 'Cada pedido suena y aparece al instante en tu panel, en la cocina y en la impresora de comandas.' },
  { icon: 'wallet',  title: 'Tu dinero, cuadrado',          body: 'Corte de caja, costo por plato, margen real y reportes que puedes exportar. Sin hojas de cálculo a mano.' },
  { icon: 'box',     title: 'Sabes qué tienes y qué falta', body: 'Inventario con recetas y kardex: cada venta descuenta insumos y te avisa antes de quedarte sin nada.' },
  { icon: 'sparkle', title: 'Tu marca, no la nuestra',      body: 'Colores, logo, fotos y tipografía propios. Tus clientes ven tu restaurante, no “otra app” con tu comida adentro.' },
];
const FOR_DINER = [
  { icon: 'grid',  title: 'Abre con un QR',      body: 'Escanea y ve el menú al instante. Sin descargar apps y sin PDFs que tardan en cargar.' },
  { icon: 'bag',   title: 'Ordena en segundos',  body: 'Desde la mesa, para llevar o a domicilio, con fotos y descripciones que dan ganas de pedir.' },
  { icon: 'truck', title: 'Sigue su pedido',     body: 'Ve el estado en vivo — recibido, en cocina, listo — y le avisamos cuando puede pasar por él.' },
  { icon: 'star',  title: 'Vuelve por más',      body: 'Puntos de lealtad y cupones que convierten una visita suelta en un cliente que regresa.' },
];

/* Catálogo de capacidades (el bento de "todo tu restaurante"). Las dos
   primeras van a doble ancho: son las que definen el producto.
   `soon` marca lo que está construido pero todavía NO habilitado —
   ver la nota de FEL más abajo. */
const CAPABILITIES: {
  icon: string; label: string; body: string; wide?: boolean; soon?: boolean;
}[] = [
  { icon: 'bag',      label: 'Menú digital con QR',   body: 'Tu carta con fotos, categorías, variantes y combos. Cambias un precio y está en vivo al segundo.', wide: true },
  { icon: 'truck',    label: 'Pedidos en línea',      body: 'Comer en local con número de mesa, para llevar y a domicilio con mapa y zonas de reparto.', wide: true },
  { icon: 'flame',    label: 'Pantalla de cocina',    body: 'El KDS ordena las comandas por tiempo y estado.' },
  { icon: 'userPlus', label: 'Panel de mesero',       body: 'Toma la orden en la tablet, divide la cuenta y cobra.' },
  { icon: 'print',    label: 'Comandas impresas',     body: 'La comanda sale sola en la impresora térmica.' },
  { icon: 'wallet',   label: 'Finanzas y caja',       body: 'Corte de caja, gastos, margen por plato y reportes.' },
  { icon: 'box',      label: 'Inventario y recetas',  body: 'Kardex con costo promedio ponderado y alertas.' },
  { icon: 'chart',    label: 'Analítica',             body: 'Horas pico, platos estrella y ticket promedio.' },
  { icon: 'star',     label: 'Lealtad y cupones',     body: 'Puntos por compra, premios canjeables y códigos.' },
  { icon: 'calendar', label: 'Reservas y espera',     body: 'Reservaciones de mesa y control de la cola.' },
  { icon: 'users',    label: 'Personal con roles',    body: 'Cada quien entra con su PIN y ve solo lo suyo.' },
  { icon: 'dashboard',label: 'Multisucursal',         body: 'Cada local con su menú y su QR, todo en un panel.' },
  { icon: 'monitor',  label: 'Leogin Escritorio',     body: 'La app de la caja, con impresión y modo kiosco.' },
  { icon: 'thumbsUp', label: 'Encuestas',             body: 'Calificación y comentario después de cada pedido.' },
  { icon: 'globe',    label: 'Menú bilingüe',         body: 'La misma carta en dos idiomas para el turista.' },
  { icon: 'leaf',     label: 'Alérgenos y dietas',    body: 'Marca vegano, sin gluten y los 14 alérgenos.' },
  { icon: 'receipt',  label: 'Factura electrónica',   body: 'Certificación FEL de la SAT desde el mismo cobro.', soon: true },
];

/** Cuántas capacidades se ven sin abrir «Ver todo lo que incluye»: las dos
 *  anchas y una fila de tres. */
const A_LA_VISTA = 5;

const DISENOS = disenosDeLaPortada();

/** Escalón de una entrada al deslizar (ver [data-fx] en globals.css). */
const fx = (i: number) => ({ '--fx-i': i }) as CSSProperties;
/** Orden de una palabra del titular. */
const palabra = (i: number) => ({ '--i': i }) as CSSProperties;

const steps = (trialDays: number) => [
  { n: '1', title: 'Crea tu cuenta',       body: `Te registras y tu restaurante queda en línea al instante. Sin tarjeta y con ${trialDays} días de prueba en los planes con pedidos.` },
  { n: '2', title: 'Súbelo a tu estilo',   body: 'Un asistente te lleva paso a paso por colores, logo y tu primer menú. No necesitas saber nada de tecnología.' },
  { n: '3', title: 'Comparte tu QR',       body: 'Lo pones en las mesas o en el mostrador. Tus clientes escanean, ordenan, y tú recibes todo en tiempo real.' },
];

/* Los precios salen del PlanPricing vigente (overrides del super admin),
   no del default de plans.ts — por eso esto es función y no constante. */
function landingPlans(pricing: PlanPricing) {
  return PUBLIC_PLANS.map((code) => ({
    code,
    name: PLANS[code].name,
    price: pricing.prices[code] === 0 ? 'Gratis' : planPriceQ(pricing, code),
    isFree: pricing.prices[code] === 0,
    tagline: PLANS[code].tagline,
    // Los mismos puntos que en Mi cuenta y Suscripción (MIC-05).
    points: PLAN_POINTS[code],
    accent: PLANS[code].highlight,
    badge: PLANS[code].badge,
  }));
}

const FAQS = [
  { q: '¿Necesito saber de tecnología?', a: 'No. Te guiamos paso a paso y en minutos tienes tu menú en vivo. Si prefieres, lo configuramos por ti sin costo adicional.' },
  { q: '¿Cobran comisión por cada pedido?', a: 'No. Pagas una mensualidad fija según tu plan. Lo que vendes es tuyo: igual en un mes flojo que en tu mejor mes, sin porcentajes sobre tus ventas.' },
  { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Todo abre con el QR en el navegador del celular, al instante. Si tu cliente quiere, puede “instalarlo” en su pantalla de inicio, pero es opcional.' },
  { q: '¿Y si se va el internet en el restaurante?', a: 'Sigues operando. Con Leogin Escritorio la caja funciona en tu red local: toma pedidos, imprime las comandas y sincroniza todo con la nube en cuanto vuelve la conexión.' },
  { q: '¿Puedo cambiar de plan después?', a: 'Sí, cuando quieras y sin penalización. Empiezas en el plan que te convenga hoy y subes a medida que creces.' },
  { q: '¿Sirve si tengo varias sucursales?', a: 'Sí. Cada sucursal tiene su propio menú, su QR y su equipo, y tú ves todo consolidado en un panel de grupo.' },
  { q: '¿De quién son mis datos?', a: 'Tuyos. Puedes exportar tu menú, tus pedidos y tus reportes cuando quieras desde el panel, sin pedirle permiso a nadie.' },
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
        'Sistema para restaurantes con menú digital QR, pedidos en línea, pantalla de cocina (KDS), panel de mesero, inventario, finanzas y programa de lealtad. Hecho en Guatemala.',
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
  const [pricing, proof] = await Promise.all([getEffectivePlanPricing(), getLandingProof()]);
  const demoUrl = subdomainUrl(DEMO_SLUG);
  // El QR de «Míralo en tu celular» (W1), dibujado aquí una vez.
  const demoQr = await QRCode.toString(demoUrl, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1C1C1E', light: '#FFFFFF' },
  });
  const ctaHref = contactHref();

  return (
    <div style={{ width: '100%' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(pricing)) }}
      />

      <div className="lp-avance" aria-hidden />
      <SiteHeader home />

      <main className="anim-fade-up">
        {/* ── Portada ───────────────────────────────────────── */}
        <section className="lp-shell" style={{ paddingTop: 'clamp(44px, 7vw, 84px)' }}>
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <span
                className="lp-chip"
                style={{ marginBottom: 22, background: 'color-mix(in srgb, var(--brand-accent) 10%, #fff)', borderColor: 'color-mix(in srgb, var(--brand-accent) 24%, transparent)', color: 'var(--brand-accent-ink)', fontWeight: 600 }}
              >
                <Icon name="sparkle" size={14} />
                El sistema completo para tu restaurante
              </span>

              {/* La promesa de marca (docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md §4):
                  habla del dueño y de su control, no de la lista de funciones. */}
              <h1 className="lp-h1">
                <span className="lp-w" style={palabra(0)}>Tu</span>{' '}
                <span className="lp-w" style={palabra(1)}>restaurante,</span>{' '}
                <span className="lp-subraya" style={{ color: 'var(--brand-accent-ink)' }}>
                  <span className="lp-w" style={palabra(2)}>bajo</span>{' '}
                  <span className="lp-w" style={palabra(3)}>control</span>
                </span>
                <span className="lp-w" style={palabra(4)}>.</span>
              </h1>

              <p className="lp-lead" style={{ marginTop: 22, maxWidth: 560 }}>
                Pedidos, cocina, caja e inventario en tu celular, aunque no estés.
                Una mensualidad fija y cero comisión sobre lo que vendes.
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                {/* El sí chico primero (estrategia §2.14 y §4): el menú, no «el sistema». */}
                <Link href="/registro" {...conEvento('lp-btn lp-btn-lg lp-btn-primary', EVENTOS.clicCrear, 'portada')}>
                  Crear mi menú gratis
                </Link>
                <LandingDemo href={demoUrl} qrSvg={demoQr} />
              </div>

              <p className="lp-body" style={{ fontSize: 13.5, marginTop: 18, color: 'var(--u-text-4)' }}>
                Plan Básico gratis para siempre · {pricing.trialDays} días de prueba en los planes
                con pedidos · sin tarjeta
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 28 }}>
                {[
                  { icon: 'wallet',  label: 'Sin comisión por pedido' },
                  { icon: 'grid',    label: 'Sin apps que descargar' },
                  { icon: 'sparkle', label: 'Con tu propia marca' },
                  { icon: 'plug',    label: 'Aguanta sin internet' },
                ].map((c) => (
                  <span key={c.label} className="lp-chip">
                    <Icon name={c.icon} size={14} style={{ color: 'var(--brand-accent-ink)' }} />
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="lp-hero-media" style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="lp-hero-tarjeta" style={{ width: '100%' }}>
                <LandingIntro />
              </div>
            </div>
          </div>
        </section>

        {/* ── Tira de cifras ────────────────────────────────── */}
        <section className="lp-shell lp-section-tight">
          <div
            className="lp-card"
            style={{ padding: 'clamp(20px, 3vw, 30px)', display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}
          >
            {PROOF.map((p, i) => (
              <div key={p.label} data-fx="crecer" style={fx(i)}>
                <div
                  className="t-mono"
                  style={{ fontSize: 'clamp(26px, 3.4vw, 34px)', fontWeight: 800, color: 'var(--brand-accent-ink)', letterSpacing: '-0.03em', lineHeight: 1 }}
                >
                  {p.value}
                </div>
                <div className="lp-body" style={{ fontSize: 13.5, marginTop: 8, maxWidth: 220 }}>{p.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Ya lo usan (solo con testimonios guardados en el Super, WEB-02) ── */}
        {proof.testimonials.length > 0 && (
          <section id="clientes" className="lp-shell lp-section">
            <SectionHead eyebrow="Ya lo usan" title="Restaurantes que ya trabajan con Leogin" center />
            <Testimonials items={proof.testimonials} />
          </section>
        )}

        {/* ── Del caos al control (la pieza central) ─────────────
            La escena se queda fija mientras bajas y tu dedo ordena la noche:
            cada papelito vuela a su lugar y se vuelve su pantalla de Leogin.
            Es la misma historia del video. Sin soporte de animaciones
            atadas al deslizar se ven los tres pasos y el panel ya ordenado. */}
        <section id="producto" className="lp-cc lp-section" aria-labelledby="cc-titulo">
          <div className="lp-shell lp-cc-escena">
            <div className="lp-cc-pasos">
              <div className="lp-cc-paso" data-p="1">
                <div className="lp-eyebrow">Una noche normal</div>
                <h2 id="cc-titulo" className="lp-h2">Pedidos por WhatsApp, comandas a gritos y la caja en un cuaderno.</h2>
                <p className="lp-lead">Así trabaja la mayoría: todo suelto y a mano. Y lo que no se anota, se pierde.</p>
                <span className="lp-cc-pista" aria-hidden>
                  <Icon name="arrowDown" size={15} /> Desliza y míralo ordenarse
                </span>
              </div>
              <div className="lp-cc-paso" data-p="2">
                <div className="lp-eyebrow">Entra Leogin</div>
                <h2 className="lp-h2">Cada cosa cae en su lugar.</h2>
                <p className="lp-lead">El pedido entra solo y suena. La cocina lo ve en su pantalla. Cada cobro queda registrado.</p>
              </div>
              <div className="lp-cc-paso" data-p="3">
                <div className="lp-eyebrow">Tú, bajo control</div>
                <h2 className="lp-h2">Al cerrar, sabes cuánto vendiste y cuánto ganaste.</h2>
                <p className="lp-lead">Desde tu celular, aunque no estés en el local. Sin cuadernos y sin sorpresas.</p>
              </div>
            </div>
            <CaosControl />
          </div>
        </section>

        {/* ── Centro de control ─────────────────────────────── */}
        <section className="lp-shell lp-section">
          <div className="lp-split">
            <div className="lp-split-media" data-fx="enderezar" style={{ display: 'flex', justifyContent: 'center' }}>
              <PanelMockup />
            </div>
            <div>
              <div className="lp-eyebrow">Tu centro de control</div>
              <h2 className="lp-h2" style={{ marginTop: 14 }}>Un panel que trabaja contigo</h2>
              <p className="lp-lead" style={{ marginTop: 16, fontSize: 16 }}>
                Cada pedido suena y aparece al instante. La cocina lo ve en su pantalla, la comanda
                se imprime sola y al cerrar el día tienes tus números claros — sin pasar nada a mano.
              </p>
              <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: 'bellRing', t: 'Alerta que no se ignora', d: 'Sonido, aviso de escritorio y notificación al teléfono hasta que alguien lo atienda.' },
                  { icon: 'flame',    t: 'Cocina sincronizada',     d: 'El KDS muestra cada comanda con su cronómetro y su estado.' },
                  { icon: 'banknote', t: 'Corte de caja al cerrar', d: 'Ventas por canal y método de pago, propinas, gastos y margen del día.' },
                ].map((r) => (
                  <li key={r.t} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                    <span className="lp-icon lp-icon-sm"><Icon name={r.icon} size={16} /></span>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--u-text)' }}>{r.t}</div>
                      <div className="lp-body" style={{ fontSize: 13.5, marginTop: 3 }}>{r.d}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Tu menú, a tu manera (vitrina de diseños) ─────────
            El menú de verdad de Rincón 502 en las ocho estructuras; el que
            visita le pone su nombre y se lleva el estilo al registro. */}
        <section id="disenos" className="lp-shell lp-section">
          <SectionHead
            eyebrow="Tu menú, a tu manera"
            title="Una carta, ocho maneras de recorrerla"
            lead="Este es el menú de Rincón 502, nuestro restaurante de ejemplo, funcionando de verdad. Ponle tu nombre y desliza: cada estructura cambia cómo se recorre la carta, y cada paleta, cómo se siente."
          />
          <div style={{ marginTop: 30 }}>
            <LandingDisenos disenos={DISENOS} combinaciones={BUILTIN_TEMPLATES.length} />
          </div>
        </section>

        {/* ── Funciona sin internet ─────────────────────────── */}
        <section className="lp-shell lp-section">
          <div className="lp-split">
            <div>
              <div className="lp-eyebrow">Leogin Escritorio</div>
              <h2 className="lp-h2" style={{ marginTop: 14 }}>Si se cae el internet, tú sigues vendiendo</h2>
              <p className="lp-lead" style={{ marginTop: 16, fontSize: 16 }}>
                Instalas Leogin en la computadora de la caja y esa máquina se vuelve el cerebro del
                local: recibe los pedidos por tu red, imprime las comandas y guarda todo. Cuando el
                internet vuelve, sincroniza solo — sin pedidos perdidos ni comandas repetidas.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
                {['Impresión térmica automática', 'Modo kiosco', 'Se actualiza sola', 'Windows'].map((t) => (
                  <span key={t} className="lp-chip">{t}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 26 }}>
                <Link href="/descargas" className="lp-btn lp-btn-soft">
                  <Icon name="download" size={16} /> Descargar Leogin Escritorio
                </Link>
              </div>
            </div>
            <div className="lp-split-media" style={{ display: 'flex', justifyContent: 'center' }}>
              <OfflineCard />
            </div>
          </div>
        </section>

        {/* ── Bento de capacidades ──────────────────────────── */}
        <section id="capacidades" className="lp-shell lp-section">
          <SectionHead
            eyebrow="Todo en un solo lugar"
            title="Crece sin cambiar de sistema"
            lead="Empiezas con el menú y activas lo demás cuando tu restaurante lo pida. Nada de migrar de plataforma a los seis meses."
            center
          />
          {/* Ley de Hick (estrategia §2.6): a la vista, lo que define el
              producto; la lista completa se abre aparte (W4). */}
          <div className="lp-bento" style={{ marginTop: 34 }}>
            {CAPABILITIES.slice(0, A_LA_VISTA).map((c, i) => (
              <div
                key={c.label}
                className={`lp-card lp-card-lift ${c.wide ? 'lp-bento-wide' : ''}`}
                data-fx=""
                style={{ padding: '18px 18px 20px', borderRadius: 18, ...fx(i % 3) }}
              >
                <span className="lp-icon"><Icon name={c.icon} size={19} /></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', letterSpacing: '-0.01em' }}>
                    {c.label}
                  </h3>
                  {c.soon && (
                    <span
                      className="t-kicker"
                      style={{ fontSize: 8.5, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 99, color: 'var(--u-text-3)', background: 'color-mix(in srgb, var(--u-text) 8%, transparent)' }}
                    >
                      Pronto
                    </span>
                  )}
                </div>
                <p className="lp-body" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{c.body}</p>
              </div>
            ))}
          </div>
          <details className="lp-incluye">
            <summary className="lp-btn lp-btn-soft">
              Ver todo lo que incluye · {CAPABILITIES.length - A_LA_VISTA} herramientas más
              <Icon name="chevronDown" size={16} />
            </summary>
            <div className="lp-bento" style={{ marginTop: 14 }}>
              {CAPABILITIES.slice(A_LA_VISTA).map((c) => (
                <div key={c.label} className="lp-card" style={{ padding: '18px 18px 20px', borderRadius: 18 }}>
                  <span className="lp-icon"><Icon name={c.icon} size={19} /></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                    <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', letterSpacing: '-0.01em' }}>
                      {c.label}
                    </h3>
                    {c.soon && (
                      <span
                        className="t-kicker"
                        style={{ fontSize: 8.5, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 99, color: 'var(--u-text-3)', background: 'color-mix(in srgb, var(--u-text) 8%, transparent)' }}
                      >
                        Pronto
                      </span>
                    )}
                  </div>
                  <p className="lp-body" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{c.body}</p>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* ── Para quién ────────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead
            eyebrow="Dos lados, un sistema"
            title="Enamora a tus clientes y controla tu negocio"
            center
          />
          {/* El menú real de un cliente (o el de ejemplo): es lo que ve el comensal. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 34 }}>
            <LandingPhone showcase={proof.showcase} />
          </div>
          <div className="lp-split" style={{ marginTop: 34, alignItems: 'start' }}>
            <div>
              <div className="lp-eyebrow" style={{ marginBottom: 16, display: 'block' }}>Para tus clientes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {FOR_DINER.map((f, i) => <FeatureRow key={f.title} {...f} lado="izq" i={i} />)}
              </div>
            </div>
            <div>
              <div className="lp-eyebrow" style={{ marginBottom: 16, display: 'block' }}>Para ti, el dueño</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {FOR_OWNER.map((f, i) => <FeatureRow key={f.title} {...f} lado="der" i={i} />)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Cómo empezar ──────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead
            eyebrow="Cómo se empieza"
            title="De cero a tu menú en línea"
            lead="Sin instalar nada, sin contratos y sin que toques una línea de código."
            center
          />
          <div className="lp-steps" style={{ marginTop: 34 }}>
            {steps(pricing.trialDays).map((s, i) => (
              <div key={s.n} className="lp-card" data-fx="" style={{ padding: '26px 22px', ...fx(i) }}>
                <span className="lp-step-n">{s.n}</span>
                <h3 className="lp-h3" style={{ marginTop: 16 }}>{s.title}</h3>
                <p className="lp-body" style={{ fontSize: 13.5, marginTop: 8 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Planes ────────────────────────────────────────── */}
        <section id="planes" className="lp-shell lp-section">
          <SectionHead
            eyebrow="Planes"
            title="Precio fijo, sin sorpresas"
            lead="Empieza gratis. No cobramos comisión por pedido ni un porcentaje de tus ventas. Cancela cuando quieras."
            center
          />
          <div className="lp-cols-3" style={{ marginTop: 34, alignItems: 'stretch' }}>
            {landingPlans(pricing).map((p, i) => (
              <div
                key={p.code}
                className="lp-card"
                data-fx=""
                style={{
                  ...fx(i),
                  padding: '28px 24px',
                  display: 'flex', flexDirection: 'column',
                  ...(p.accent
                    ? {
                        borderColor: 'color-mix(in srgb, var(--brand-accent) 55%, transparent)',
                        borderWidth: 1.5,
                        boxShadow: 'var(--lp-shadow-lg)',
                      }
                    : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 22 }}>
                  <h3 className="lp-h3" style={{ fontSize: 20 }}>{p.name}</h3>
                  {p.badge && (
                    <span
                      className="t-kicker"
                      style={{
                        fontSize: 8.5, letterSpacing: '0.1em', padding: '4px 9px', borderRadius: 99,
                        color: p.accent ? 'var(--brand-on-accent)' : 'var(--brand-accent-ink)',
                        background: p.accent ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--brand-accent) 12%, transparent)',
                      }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                  <span className="t-mono" style={{ fontWeight: 800, fontSize: 34, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
                    {p.price}
                  </span>
                  {!p.isFree && <span className="lp-body" style={{ fontSize: 13.5 }}>/ mes</span>}
                </div>

                <p className="lp-body" style={{ fontSize: 13.5, marginTop: 8, minHeight: 42 }}>{p.tagline}</p>

                <ul style={{ listStyle: 'none', margin: '20px 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
                  {p.points.map((pt) => (
                    <li key={pt.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5 }}>
                      {/* «Sin pedidos en línea» llevaba una palomita como si
                          fuera algo a favor: lo que el plan no trae, con «—». */}
                      <Icon name={pt.positive ? 'check' : 'minus'} size={15} strokeWidth={2.6} style={{ color: pt.positive ? 'var(--brand-accent-ink)' : 'var(--u-text-4)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ color: pt.positive ? 'var(--u-text-2)' : 'var(--u-text-3)', lineHeight: 1.45 }}>{pt.text}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/registro"
                  {...conEvento(`lp-btn ${p.accent ? 'lp-btn-primary' : 'lp-btn-soft'}`, EVENTOS.clicCrear, `plan ${p.name}`)}
                  style={{ width: '100%' }}
                >
                  {/* En los de pago lo que pasa es una prueba, no «gratis»
                      (WEB-07). */}
                  {p.isFree ? 'Empezar gratis' : pricing.trialDays > 0 ? `Probar ${pricing.trialDays} días gratis` : 'Elegir este plan'}
                </Link>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href="/planes" className="lp-btn lp-btn-sm lp-btn-soft">
              Ver comparativa completa <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </section>

        {/* ── Preguntas frecuentes ──────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead eyebrow="Dudas" title="Preguntas frecuentes" center />
          <div style={{ maxWidth: 820, margin: '30px auto 0' }}>
            {FAQS.map((f, i) => (
              <details key={f.q} className="lp-faq" open={i === 0}>
                <summary>
                  {f.q}
                  <Icon name="chevronDown" size={18} className="lp-faq-mark" />
                </summary>
                <p className="lp-body lp-faq-body">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Cierre: Leo asoma por el borde y saluda ───────────
            El final es lo que más se recuerda (pico y final): Leo, la
            promesa y el botón. */}
        <section className="lp-shell lp-section lp-cierre" style={{ paddingBottom: 'clamp(72px, 9vw, 112px)', paddingTop: 56 }}>
          <div style={{ position: 'relative' }}>
            <div className="lp-cierre-leo">
              <Leo id="leo-cierre" />
            </div>
            <div className="lp-cierre-globo" aria-hidden>¡Te lo armamos hoy!</div>
            <div
              className="lp-cierre-banda"
              style={{
                overflow: 'hidden', borderRadius: 28,
                padding: 'clamp(40px, 6vw, 64px) clamp(24px, 4vw, 48px)',
                textAlign: 'center',
                background: 'linear-gradient(150deg, #1f1e23 0%, #17161a 55%, #241a16 100%)',
                boxShadow: 'var(--lp-shadow-lg)',
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute', inset: 'auto -10% -55%', height: 320,
                  background: 'radial-gradient(55% 75% at 50% 100%, color-mix(in srgb, var(--brand-accent) 46%, transparent), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <h2 className="lp-h2" style={{ color: '#F5F3EF' }}>
                  Ponlo bajo control hoy
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(245,243,239,0.72)', maxWidth: 520, margin: '14px auto 0' }}>
                  Crea tu restaurante en minutos y pruébalo sin pagar nada. ¿Prefieres que te
                  acompañemos en la configuración? Escríbenos por WhatsApp y lo armamos juntos.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/registro" {...conEvento('lp-btn lp-btn-lg lp-btn-primary', EVENTOS.clicCrear, 'cierre')}>
                    Crear mi menú gratis
                  </Link>
                  <a
                    href={ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lp-btn lp-btn-lg"
                    style={{ background: 'rgba(245,243,239,0.10)', color: '#F5F3EF', borderColor: 'rgba(245,243,239,0.22)' }}
                  >
                    <Icon name="whatsapp" size={17} /> Hablar con ventas
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter home />
    </div>
  );
}



/* ── Fila de característica con ícono ─────────────────────────── */
function FeatureRow({ icon, title, body, lado, i }: { icon: string; title: string; body: string; lado: 'izq' | 'der'; i: number }) {
  return (
    <div className="lp-card lp-card-lift" data-fx={lado} style={{ padding: '18px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', borderRadius: 18, ...fx(i % 2) }}>
      <span className="lp-icon"><Icon name={icon} size={19} /></span>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', letterSpacing: '-0.01em' }}>{title}</h3>
        <p className="lp-body" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 5 }}>{body}</p>
      </div>
    </div>
  );
}

/* ── Mockup del panel de administración ────────────────────────
   La pantalla va CLARA porque el panel real va claro desde el
   rediseño 2026-07-12: enseñar aquí una captura oscura sería
   enseñar un producto que ya no existe. El bisel sí se queda
   oscuro (.lp-device) para despegarlo del lienzo.               */
function PanelMockup() {
  const kpis = [
    { label: 'Ventas hoy', value: 'Q1,240' },
    { label: 'Pedidos', value: '32' },
    { label: 'Ticket prom.', value: 'Q39' },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 470 }}>
      {/* Halo detrás del mockup. `inset: 0` y no un valor negativo: la
          envoltura ocupa toda la columna de la rejilla, así que cualquier
          desbordamiento se salía del viewport en móvil (lo tapaba el
          `overflow-x: clip` de html, pero el ancho de scroll ya no cuadraba). */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(68% 62% at 50% 45%, color-mix(in srgb, var(--brand-accent) 17%, transparent), transparent 72%)',
          pointerEvents: 'none',
        }}
      />
      <div className="lp-device lp-device-desk">
        <div className="lp-device-screen-desk" style={{ background: '#f4f4f6' }}>
          {/* Barra de ventana */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', background: '#fff', borderBottom: '1px solid rgba(23,22,26,0.08)' }}>
            {['#ef7b6d', '#f0b429', '#4caf7d'].map((c) => (
              <span key={c} style={{ width: 8, height: 8, borderRadius: 99, background: c }} />
            ))}
            <span style={{ fontSize: 10.5, color: 'rgba(23,22,26,0.6)', marginLeft: 8, fontWeight: 650 }}>Pedidos en vivo</span>
            <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 800, color: '#157347', background: 'rgba(21,115,71,0.10)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>
              ● EN VIVO
            </span>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '12px 12px 0' }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid rgba(23,22,26,0.07)', borderRadius: 10, padding: '9px 10px' }}>
                <div style={{ fontSize: 7.5, color: 'rgba(23,22,26,0.64)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{k.label}</div>
                <div className="t-mono" style={{ fontSize: 14, fontWeight: 800, color: '#17161a', marginTop: 4, letterSpacing: '-0.02em' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Pedido entrante */}
          <div
            style={{
              margin: '12px', background: '#fff', borderRadius: 12, padding: '11px 13px',
              border: '1.5px solid color-mix(in srgb, var(--brand-accent) 45%, transparent)',
              boxShadow: '0 6px 18px color-mix(in srgb, var(--brand-accent) 14%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'var(--brand-accent)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>NUEVO</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#17161a' }}>Mesa 4 · #128</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(23,22,26,0.64)' }}>hace 12 s</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(23,22,26,0.7)', marginTop: 8, lineHeight: 1.6 }}>
              2× Rincón Clásica · 1× Papas con Queso<br />1× Malteada de fresa
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
              <span className="t-mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-accent-ink)' }}>Q167</span>
              <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'var(--brand-accent)', padding: '6px 12px', borderRadius: 99 }}>Aceptar</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(23,22,26,0.72)', border: '1px solid rgba(23,22,26,0.16)', padding: '6px 12px', borderRadius: 99 }}>Imprimir</span>
            </div>
          </div>

          {/* Pedido en preparación */}
          <div style={{ margin: '0 12px 12px', background: '#fff', border: '1px solid rgba(23,22,26,0.07)', borderRadius: 12, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#805600', background: 'rgba(128,86,0,0.10)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>EN COCINA</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(23,22,26,0.8)' }}>Para llevar · #127</span>
            <span className="t-mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(23,22,26,0.64)' }}>08:41</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tarjeta ilustrativa del modo sin internet ─────────────────── */
function OfflineCard() {
  const rows = [
    { icon: 'bag',   label: 'Pedido #131 · Mesa 2', state: 'Recibido en la caja', ok: true },
    { icon: 'print', label: 'Comanda impresa',      state: 'Impresora de cocina', ok: true },
    { icon: 'box',   label: 'Guardado en la PC',    state: 'En cola para subir',  ok: true },
    { icon: 'globe', label: 'Sincronizar con la nube', state: 'Al volver el internet', ok: false },
  ];
  return (
    <div className="lp-card" style={{ width: '100%', maxWidth: 420, padding: '20px 20px 22px', boxShadow: 'var(--lp-shadow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="lp-icon lp-icon-sm" style={{ background: 'rgba(154,103,0,0.12)', color: '#8a5c00' }}>
          <Icon name="alertCircle" size={16} />
        </span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>Sin conexión a internet</div>
          <div className="lp-body" style={{ fontSize: 12 }}>El local sigue operando en modo local</div>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '11px 12px', borderRadius: 13,
              background: r.ok ? 'rgba(21,115,71,0.06)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: `1px solid ${r.ok ? 'rgba(21,115,71,0.16)' : 'var(--lp-line)'}`,
            }}
          >
            <Icon name={r.icon} size={16} style={{ color: r.ok ? '#157347' : 'var(--u-text-4)', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--u-text)' }}>{r.label}</div>
              <div className="lp-body" style={{ fontSize: 11.5 }}>{r.state}</div>
            </div>
            {r.ok
              ? <Icon name="checkCircle" size={17} style={{ color: '#157347', flexShrink: 0 }} />
              : <Icon name="clock" size={17} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
          </div>
        ))}
      </div>

      <p className="lp-body" style={{ fontSize: 12, marginTop: 16 }}>
        Nada se pierde y nada se duplica: cada pedido lleva su propio identificador, así que al
        volver la conexión sube una sola vez.
      </p>
    </div>
  );
}

/* ── Del caos al control: la escena ────────────────────────────
   Seis cosas de una noche mala (el chat enojado, la comanda arrugada, las
   llamadas perdidas, el cuaderno, el post-it y el PDF) y su pantalla de
   Leogin. Cada una vive en su lugar FINAL del panel; el caos es un
   desplazamiento que el deslizar deshace (--cx, --cy, --cr en globals.css).
   Para quien usa lector de pantalla la escena es una imagen con su
   descripción: el texto de los pasos ya cuenta la historia. */
function CaosControl() {
  const visto = <span className="lp-cc-visto" aria-hidden><Icon name="check" size={13} strokeWidth={3} /></span>;
  const piezas: { c: string; caos: ReactNode; orden: ReactNode }[] = [
    {
      c: 'chat',
      caos: <><small>Cliente · WhatsApp · 9:47 p. m.</small>¿Ya viene mi pedido? Llevo 40 minutos esperando…</>,
      orden: (
        <>
          <header>Mesa 4 · #128<span className="lp-cc-chip">NUEVO</span></header>
          <strong>2× Rincón Clásica</strong>
          <p>1× Malteada de fresa</p>
          <footer className="t-mono">Q132</footer>
        </>
      ),
    },
    {
      c: 'comanda',
      caos: <span className="lp-cc-mano"><small>Comanda</small><span className="lp-cc-tachado">2 hamb.</span> 2 clásicas s/ cebolla<br /><span className="lp-cc-rojo">¿mesa 4 o 6?</span></span>,
      orden: (
        <>
          <header>Cocina<span className="lp-cc-chip" data-t="warn">EN COCINA</span></header>
          <strong>2× Rincón Clásica</strong>
          <p>Sin cebolla · Mesa 4</p>
          <footer className="t-mono"><Icon name="clock" size={12} /> 08:41</footer>
        </>
      ),
    },
    {
      c: 'llamadas',
      caos: <><small>Teléfono</small><span className="lp-cc-rojo">3 llamadas perdidas</span><br />«¿Ya está lo de para llevar?»</>,
      orden: (
        <>
          <header>Para llevar · #129<span className="lp-cc-chip" data-t="ok">LISTO</span></header>
          <strong>Doble Bacon + Papas</strong>
          <p>Le avisamos al cliente que ya puede pasar.</p>
        </>
      ),
    },
    {
      c: 'cuaderno',
      caos: <span className="lp-cc-mano">Q85 + Q120 + Q90 = ¿?<br />¿y lo de la tarjeta?</span>,
      orden: (
        <>
          <header>Corte de caja<span className="lp-cc-chip" data-t="ok">CUADRA</span></header>
          <span className="lp-cc-grande">Q1,240</span>
          <p>Efectivo Q640 · Tarjeta Q600</p>
        </>
      ),
    },
    {
      c: 'postit',
      caos: <span className="lp-cc-mano">¡Se acabó el queso!</span>,
      orden: (
        <>
          <header>Inventario<span className="lp-cc-chip" data-t="warn">BAJO</span></header>
          <strong>Queso cheddar: 2 kg</strong>
          <p>Alcanza para hoy. Pídelo mañana temprano.</p>
        </>
      ),
    },
    {
      c: 'pdf',
      caos: <><small>Archivo</small>menu_final_v3.pdf<br />12 MB · precios del año pasado</>,
      orden: (
        <>
          <header>Menú con QR<span className="lp-cc-chip" data-t="ink">EN VIVO</span></header>
          <strong>Doble Bacon, ahora Q68</strong>
          <p>Lo cambiaste desde el celular y ya lo ven tus clientes.</p>
        </>
      ),
    },
  ];
  return (
    <div
      className="lp-cc-lienzo"
      role="img"
      aria-label="El panel de Leogin con todo en orden: el pedido de la Mesa 4, la comanda en la pantalla de cocina, un pedido para llevar listo, el corte de caja que cuadra, el aviso de inventario y el menú con QR."
    >
      <div className="lp-cc-ruido" />
      <div className="lp-cc-cabecera">
        <b>Hoy</b>
        <span>Q1,240 · 32 pedidos</span>
        <em>Todo bajo control</em>
      </div>
      {piezas.map((p, i) => (
        <div key={p.c} className="lp-cc-obj" data-o={i + 1} style={{ '--o': i } as CSSProperties}>
          <div className="lp-cc-tiembla">
            <div className="lp-cc-caos" data-c={p.c}>{p.caos}</div>
          </div>
          <div className="lp-cc-orden">{p.orden}{visto}</div>
        </div>
      ))}
    </div>
  );
}
