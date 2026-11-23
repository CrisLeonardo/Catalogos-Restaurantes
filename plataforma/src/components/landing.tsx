import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { SiteHeader, SiteFooter, SectionHead, contactHref, CONTACT_ICON, CONTACT_VIA } from '@/components/site-chrome';
import { subdomainUrl, rootDomainForUrls, DEMO_SLUG } from '@/lib/tenant';
import { PLANS, PUBLIC_PLANS, planPriceQ, planPresentation, type PlanPricing } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { getLandingProof } from '@/lib/db/landing';
import { Testimonials } from '@/components/landing-proof';
import { LandingIntro } from '@/components/landing-intro';
import { Leo } from '@/components/leo';
import { LandingDemo } from '@/components/landing-demo';
import { PlanPorPreguntas, type PlanDeLaWeb } from '@/components/landing-planes';
import { enlaceDeAlta, type PlanAlta } from '@/lib/alta';
import planesCss from '@/components/landing-planes.module.css';

/* ============================================================
   PORTADA DE LEOGIN — siete bloques (línea N + fichas V.1–V.3)
   ------------------------------------------------------------
   Maqueta aprobada el 2026-11-18
   (docs/diseno/MAQUETA_WEB_PUBLICA_NADA_SATURADO_2026-11-18.html).

   Antes: 13 bloques y 16,577 px en el teléfono; el precio a 12,100 px y
   la demo escondida en un botón secundario. Ahora:
     1. titular y video (aprobados), con «Probar la demo» como acción
        principal y «Crear mi restaurante» segunda;
     2. ¿cuál es tu caso? — tres situaciones con su plan y su precio (V.2);
     3. Pídelo tú mismo (la demo);
     4. la noche que se ordena (la escena «del caos al control», que ya
        cuenta los tres momentos: el pedido, la cocina y el cierre);
     5. ¿qué plan te conviene? — dos preguntas, misma regla que el alta (V.3);
     6. preguntas frecuentes (sin internet, crecer, diseños… viven aquí);
     7. el cierre con Leo.
   Salieron la tira de cifras, el panel, la vitrina de diseños, sin
   internet, el bento de funciones, «para quién» y «cómo se empieza».
   ============================================================ */

/* Una línea por plan: lo que trae, para la lista de «¿qué plan te conviene?». */
function planesDeLaWeb(pricing: PlanPricing): PlanDeLaWeb[] {
  return PUBLIC_PLANS.map((code) => {
    const gratis = pricing.prices[code] === 0;
    const puntos = planPresentation({ plan: code, pricing }).points.filter((p) => p.positive).map((p) => p.text);
    return {
      code: code as PlanAlta,
      nombre: PLANS[code].name,
      precio: gratis ? 'Gratis' : planPriceQ(pricing, code),
      gratis,
      resumen: puntos.slice(0, 2).join(' · '),
    };
  });
}

const FAQS = [
  { q: '¿Necesito saber de tecnología?', a: 'No. Te guiamos paso a paso y en minutos tienes tu menú en vivo. Si prefieres configuración asistida, consulta su tarifa en Planes.' },
  { q: '¿Cobran comisión por cada pedido?', a: 'No. Pagas una mensualidad fija según tu plan. Lo que vendes es tuyo: igual en un mes flojo que en tu mejor mes, sin porcentajes sobre tus ventas.' },
  { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Todo abre con el QR en el navegador del celular, al instante. Si tu cliente quiere, puede “instalarlo” en su pantalla de inicio, pero es opcional.' },
  { q: '¿Y si se va el internet en el restaurante?', a: 'Si configuramos contigo una PC principal con Leogin Escritorio, el local sigue tomando pedidos por tu red (y, en Premium, imprimiendo las comandas) y todo se sincroniza con la nube al volver la conexión. Sin esa PC, el panel necesita internet.' },
  { q: '¿Cómo se verá mi carta?', a: 'Con tus colores, tu logo y tus fotos. Al crear tu restaurante eliges entre ocho maneras de recorrer la carta y decenas de paletas, y la cambias cuando quieras. La demo de Rincón 502 es una de ellas.' },
  { q: '¿Qué pasa cuando crezca?', a: 'Empiezas con lo que necesitas hoy y subes de plan cuando lo pidas, sin cambiar de sistema: mesas, cocina, inventario, lealtad, reservas y varias sucursales viven en el mismo panel.' },
  { q: '¿Puedo cambiar de plan después?', a: 'Sí, cuando quieras y sin penalización. Empiezas en el plan que te convenga hoy y subes a medida que creces.' },
  { q: '¿Sirve si tengo varias sucursales?', a: 'Sí. Cada sucursal tiene su propio menú, su QR y su equipo, y tú ves todo consolidado desde Mi cuenta.' },
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
        'Sistema para restaurantes con menú digital QR, pedidos en línea, pantalla de cocina, panel de mesero, inventario, finanzas y programa de lealtad. Hecho en Guatemala.',
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
  const ctaHref = contactHref();
  const precio = (code: PlanAlta) => (pricing.prices[code] === 0 ? 'Gratis' : `${planPriceQ(pricing, code)}/mes`);

  /* Los tres casos de V.2, con la misma regla que el alta (lib/alta.ts):
     mesas → Premium, mostrador → Estándar, redes → En línea. «Vendo por
     redes» lleva a /vende-en-linea, su página propia. */
  const casos: { icono: string; titulo: string; texto: string; plan: PlanAlta; href: string }[] = [
    { icono: 'utensils', titulo: 'Tengo mesas y meseros', texto: 'El mesero pide en el celular, cocina lo ve en su pantalla y la caja cobra por mesa.', plan: 'PREMIUM', href: demoUrl },
    { icono: 'coffee', titulo: 'Cafetería o mostrador', texto: 'Piden en el mostrador o para llevar, sin mesero. Cobras y la comanda llega sola a cocina.', plan: 'ESTANDAR', href: demoUrl },
    { icono: 'whatsapp', titulo: 'Vendo por redes', texto: 'Tus clientes piden desde WhatsApp o Instagram, para llevar o a domicilio.', plan: 'EN_LINEA', href: '/vende-en-linea' },
  ];

  return (
    <div style={{ width: '100%' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(pricing)) }}
      />

      <div className="lp-avance" aria-hidden />
      <SiteHeader home />

      <main className="lp-main">
        {/* ── 1 · Titular y video ──────────────────────────────
            El titular y el video «Un solo lugar» son los aprobados. La
            acción principal es probar la demo: es lo que mejor explica
            Leogin. Crear el restaurante va segundo, y lo que es gratis se
            dice DEBAJO del botón, no dentro (V.1, F01). */}
        <section className="lp-shell" style={{ paddingTop: 'clamp(28px, 7vw, 84px)' }}>
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <h1 className="lp-h1">
                <span className="lp-w" style={palabra(0)}>Tu</span>{' '}
                <span className="lp-w" style={palabra(1)}>restaurante,</span>{' '}
                <span className="lp-subraya" style={{ color: 'var(--brand-accent-ink)' }}>
                  <span className="lp-w" style={palabra(2)}>bajo</span>{' '}
                  <span className="lp-w" style={palabra(3)}>control</span>
                </span>
                <span className="lp-w" style={palabra(4)}>.</span>
              </h1>

              <p className="lp-lead" style={{ marginTop: 20, maxWidth: 560 }}>
                Salón, cocina y caja trabajando juntos, en tu celular. Mensualidad fija, sin comisión por venta.
              </p>
            </div>

            <div className="lp-hero-media" style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="lp-hero-tarjeta" style={{ width: '100%' }}>
                <LandingIntro
                  ruta="un-lugar"
                  cuadrada
                  pelicula
                  alt="Hoy tu restaurante vive en 8 lugares. Video: qué es Leogin"
                  etiqueta="Qué es Leogin · 53 s"
                />
              </div>
            </div>

            <div className="lp-hero-acciones">
              <div className="lp-hero-ctas">
                <LandingDemo href={demoUrl} primaria />
                <Link href="/registro" {...conEvento('lp-btn lp-btn-lg lp-btn-soft', EVENTOS.clicCrear, 'portada')}>
                  Crear mi restaurante
                </Link>
              </div>
              <p className="lp-body" style={{ fontSize: 14, marginTop: 14, color: 'var(--u-text-3)' }}>
                La carta con QR es gratis para siempre. Los pedidos van con un plan.
              </p>
            </div>
          </div>
        </section>

        {/* ── 2 · ¿Cuál es tu caso? (V.2) ───────────────────── */}
        <section id="casos" className="lp-shell lp-section-tight">
          <SectionHead eyebrow="¿Cómo es tu negocio?" title="Elige el que se parece al tuyo" center />
          <ul className={`lp-card ${planesCss.casos}`} style={{ marginTop: 24 }}>
            {casos.map((c) => (
              <li key={c.titulo}>
                <Link href={c.href} className={planesCss.caso}>
                  <span className={planesCss.casoIcono} aria-hidden><Icon name={c.icono} size={20} /></span>
                  <span style={{ minWidth: 0 }}>
                    <b>{c.titulo}</b>
                    <span>{c.texto}</span>
                  </span>
                  <em>{PLANS[c.plan].name}<small>{precio(c.plan)}</small></em>
                </Link>
              </li>
            ))}
          </ul>
          <p className={planesCss.soloCarta}>
            ¿Solo quieres tu carta con QR? <Link href={enlaceDeAlta({ plan: 'BASICO', caso: 'carta' })}>Básico, gratis</Link>.
          </p>
        </section>

        {/* ── Ya lo usan (solo con testimonios guardados en el Super, WEB-02) ── */}
        {proof.testimonials.length > 0 && (
          <section id="clientes" className="lp-shell lp-section">
            <SectionHead eyebrow="Ya lo usan" title="Restaurantes que ya trabajan con Leogin" center />
            <Testimonials items={proof.testimonials} />
          </section>
        )}

        {/* ── 3 · Pídelo tú mismo (la demo) ──────────────────── */}
        <section id="demo" className="lp-shell lp-section" aria-labelledby="demo-titulo">
          <div className="lp-card" style={{ padding: 'clamp(20px, 4vw, 36px)', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <div className="lp-eyebrow">Pídelo tú mismo · demostración con datos ficticios</div>
            <h2 id="demo-titulo" className="lp-h2" style={{ marginTop: 12 }}>Haz un pedido en Rincón 502 y míralo llegar.</h2>
            <p className="lp-lead" style={{ marginTop: 12, fontSize: 16 }}>
              Pide desde tu celular como un cliente y mira cómo suena en la cocina y queda en la caja. Sin dar tu número.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <LandingDemo href={demoUrl} primaria />
            </div>
          </div>
        </section>

        {/* ── 4 · La noche que se ordena ─────────────────────────
            La escena se queda fija mientras bajas y tu dedo ordena la noche:
            cada papelito vuela a su lugar y se vuelve su pantalla de Leogin.
            Son los tres momentos: el pedido entra, la cocina lo ve, al cerrar
            sabes lo que dejó el día. */}
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

        {/* ── 5 · ¿Qué plan te conviene? (V.3) ───────────────── */}
        <section id="planes" className="lp-shell lp-section">
          <SectionHead
            eyebrow="Planes"
            title="Precio fijo. Nunca un % de tus ventas."
            lead="Dinos cómo te piden y te decimos qué plan te conviene. Sin comisión por pedido y cancelas cuando quieras."
            center
          />
          <div style={{ marginTop: 28 }}>
            <PlanPorPreguntas planes={planesDeLaWeb(pricing)} origen="portada" />
          </div>
        </section>

        {/* ── 6 · Preguntas frecuentes ──────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <SectionHead eyebrow="Dudas" title="Preguntas frecuentes" center />
          <div style={{ maxWidth: 820, margin: '30px auto 0' }}>
            {FAQS.map((f) => (
              <details key={f.q} className="lp-faq">
                <summary>
                  {f.q}
                  <Icon name="chevronDown" size={18} className="lp-faq-mark" />
                </summary>
                <p className="lp-body lp-faq-body">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 7 · Cierre: Leo asoma por el borde y saluda ─────── */}
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
                  Crea tu restaurante en minutos: la carta con QR es gratis. ¿Prefieres que te
                  acompañemos en la configuración? Escríbenos {CONTACT_VIA} y lo armamos juntos.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/registro" {...conEvento('lp-btn lp-btn-lg lp-btn-primary', EVENTOS.clicCrear, 'cierre')}>
                    Crear mi restaurante
                  </Link>
                  <a
                    href={ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lp-btn lp-btn-lg"
                    style={{ background: 'rgba(245,243,239,0.10)', color: '#F5F3EF', borderColor: 'rgba(245,243,239,0.22)' }}
                  >
                    <Icon name={CONTACT_ICON} size={17} /> Hablar con ventas
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

/** Orden de una palabra del titular. */
const palabra = (i: number) => ({ '--i': i }) as CSSProperties;

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
