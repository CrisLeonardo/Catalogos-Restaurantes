import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Leo } from '@/components/leo';
import { LandingDemo } from '@/components/landing-demo';
import { CtaEnLinea } from '@/components/en-linea/cta-en-linea';
import { SiteHeader, SiteFooter, SectionHead, contactHref } from '@/components/site-chrome';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { planPriceLabel } from '@/lib/plans';
import { subdomainUrl, rootDomainForUrls, DEMO_SLUG } from '@/lib/tenant';

/* ============================================================
   LEOGIN PARA QUIEN VENDE EN LÍNEA (/vende-en-linea)
   ------------------------------------------------------------
   La portada le habla al restaurante con local: mesas, cocina,
   caja. Quien vende por WhatsApp o Instagram —desde su casa, una
   cocina sin mesas o recién empezando— la lee y piensa «esto es
   para restaurantes grandes». Esta página es su puerta: la misma
   plataforma contada con SU noche (el chat lleno de «¿precio?»),
   y con lo que NO va a usar dicho en voz alta, para que lo simple
   se sienta simple.

   El orden es el del plan (docs/planes/PLAN_PORTADA_Y_VENDE_EN_LINEA_2026-10-27.md §2):
   espejo (ese soy yo) → alivio (el chat se vuelve un pedido) →
   cómo (tres pasos) → poda (solo lo que necesitas) → precio en
   pequeño (menos de Q7 al día) → dudas → cierre con Leo.

   Lo que se promete es lo que hay en Estándar con «para llevar» y
   «a domicilio»: pedidos con avisos y WhatsApp, zonas de reparto,
   horario, seguimiento del pedido, reportes y corte. Lealtad,
   cupones e inventario son de Premium y aquí no se prometen.
   ============================================================ */

export const metadata: Metadata = {
  title: 'Leogin para vender en línea — tu menú en un link, tus pedidos en orden',
  description:
    'Para quien vende comida por WhatsApp, Instagram o Facebook: tu menú en un link, pedidos completos con dirección y forma de pago, avisos al instante y cuánto vendiste. Sin comisión.',
  alternates: { canonical: '/vende-en-linea' },
};

// El precio sale de lo vigente en /super/configuracion, como en /planes.
export const revalidate = 600;

/** Escalón de una entrada al deslizar (ver [data-fx] en globals.css). */
const fx = (i: number) => ({ '--fx-i': i }) as CSSProperties;

/* El espejo: tres momentos que cualquiera que vende por chat ya vivió. Van
   como mensajes, no como «problemas»: se reconocen antes de leerlos. */
const DOLORES = [
  {
    chat: '¿Precio?',
    titulo: 'Contestas lo mismo todo el día',
    texto: 'El precio, el menú, si hay envío a su zona. Mientras le respondes a uno, otro se cansa de esperar y le compra a alguien más.',
  },
  {
    chat: '¿Ya viene mi pedido? 😕',
    titulo: 'Un pedido se pierde entre mil mensajes',
    texto: 'La dirección quedó tres pantallas arriba y el «sin cebolla» en un audio. Basta uno mal para perder a ese cliente.',
  },
  {
    chat: '¿Cuánto vendí esta semana?',
    titulo: 'Al final no sabes cuánto ganaste',
    texto: 'Sumas notas, capturas y lo que te acuerdas. Nunca cuadra, y no sabes qué se vende más ni qué día te conviene abrir.',
  },
];

const PASOS = [
  {
    titulo: 'Pones tu link en tu bio',
    texto: 'Tu menú vive en tunegocio.distleogin.com: en Instagram, Facebook, TikTok y tu estado de WhatsApp. Con fotos, precios y tu marca.',
  },
  {
    titulo: 'Tus clientes piden solos',
    texto: 'Eligen, marcan su casa en el mapa y dicen cómo pagan. A las once de la noche también, sin que tengas que contestar.',
  },
  {
    titulo: 'Te suena y despachas',
    texto: 'Llega completo a tu celular. Lo aceptas, lo marcas listo y tu cliente ve el avance sin escribirte «¿ya viene?».',
  },
];

/* Lo que sí usa quien vende en línea (Estándar con recoger + domicilio). */
const SI = [
  { icon: 'grid',      t: 'Tu menú en un link', d: 'Fotos, precios, variantes y combos. Cambias un precio y se ve al momento.' },
  { icon: 'truck',     t: 'Para recoger y a domicilio', d: 'Con mapa, zonas de envío y su tarifa. El cliente no tiene que explicarte cómo llegar.' },
  { icon: 'bellRing',  t: 'Te suena cada pedido', d: 'En tu celular y en la computadora. Y si tu cliente quiere, te lo manda por WhatsApp ya escrito.' },
  { icon: 'clock',     t: 'Tu horario manda', d: 'Fuera de horario tu menú avisa cuándo vuelves a abrir. Nadie pide a las 3 a. m. si no quieres.' },
  { icon: 'mapPin',    t: 'Tu cliente sigue su pedido', d: 'Recibido, preparando, en camino: lo ve solo, en vivo.' },
  { icon: 'wallet',    t: 'Sabes cuánto vendiste', d: 'Ventas del día y de la semana, efectivo y tarjeta, y el corte al cerrar.' },
];

/* Lo que no le va a estorbar: dicho en voz alta, porque «el sistema completo
   para tu restaurante» le suena a algo que no va a saber usar. */
const NO = ['Mesas y meseros', 'Pantalla de cocina', 'Impresoras de comandas', 'Caja por turnos', 'Inventario con recetas'];

function faqs(trialDays: number, estandar: string, basico: string) {
  return [
    {
      q: '¿Necesito tener un local?',
      a: 'No. Leogin sirve igual si cocinas en tu casa, en una cocina sin mesas o si apenas estás empezando. Activas solo «para recoger» y «a domicilio», y tu panel no te enseña mesas ni meseros.',
    },
    {
      q: '¿Dejo de usar WhatsApp?',
      a: 'No hace falta. Al terminar su pedido tu cliente puede mandártelo por WhatsApp ya escrito, con todo, y tu número sigue en tu menú para cualquier duda. Lo que cambia es que ya no armas cada pedido a mano.',
    },
    {
      q: '¿Mis clientes tienen que descargar algo?',
      a: 'No. Tu menú abre en el navegador del celular, desde el link de tu bio o un QR. Sin apps, sin cuentas y sin contraseñas.',
    },
    {
      q: '¿Cómo me pagan?',
      a: 'El cliente elige al pedir: efectivo o tarjeta al recibir, y si paga en efectivo te dice con cuánto, para que lleves el cambio. El dinero te lo pagan a ti, como siempre: Leogin no lo toca ni se queda con un porcentaje.',
    },
    {
      q: '¿Y si solo vendo algunos días o por temporadas?',
      a: 'Pones tu horario y fuera de él tu menú avisa cuándo vuelves. Si vendes por ediciones —postres de temporada, cajas de fin de semana—, la estructura Vitrina abre y cierra pedidos con cuenta regresiva y te muestra cuántas quedan.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `El plan Estándar, con para recoger y a domicilio, cuesta ${estandar} y empiezas con ${trialDays} días gratis, sin tarjeta. Si por ahora solo quieres tu catálogo en un link, sin pedidos en línea, el Básico es ${basico.toLowerCase()} para siempre.`,
    },
  ];
}

export default async function VendeEnLinea() {
  const pricing = await getEffectivePlanPricing();
  const demoUrl = subdomainUrl(DEMO_SLUG);
  const estandarLabel = planPriceLabel(pricing, 'ESTANDAR');
  const basicoLabel = planPriceLabel(pricing, 'BASICO');
  const estandarMes = pricing.prices.ESTANDAR;
  // «Menos de Q7 al día»: el precio partido en días se compara con un
  // refresco, no con una mensualidad (contabilidad mental).
  const alDia = Math.ceil(estandarMes / 30);
  const preguntas = faqs(pricing.trialDays, estandarLabel, basicoLabel);

  const root = rootDomainForUrls();
  const base = `${root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https'}://${root}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${base}/vende-en-linea`,
    mainEntity: preguntas.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <div style={{ width: '100%' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lp-avance" aria-hidden />
      <SiteHeader />

      <main className="lp-main">
        {/* ── Portada: el espejo y el alivio en una sola pantalla ── */}
        <section className="lp-shell" style={{ paddingTop: 'clamp(36px, 6vw, 76px)' }}>
          <div className="el-hero">
            <div className="el-hero-copy">
              <span className="lp-chip el-hero-chip">
                <Icon name="whatsapp" size={14} />
                Para quien vende por WhatsApp o Instagram
              </span>
              <h1 className="lp-h1 el-h1">
                Tu menú en un link.{' '}
                <span className="lp-subraya" style={{ color: 'var(--brand-accent-ink)' }}>Tus pedidos, en orden.</span>
              </h1>
              <p className="lp-lead" style={{ marginTop: 18, maxWidth: 540 }}>
                Desde tu casa, una cocina sin mesas o recién empezando: tus clientes piden solos
                y a ti te llega cada pedido completo — qué quiere, a dónde va y cómo paga.
              </p>
            </div>

            <div className="el-hero-media">
              <ChatAPedido />
            </div>

            <div className="el-hero-acciones">
              <div className="lp-hero-ctas">
                <CtaEnLinea className="lp-btn lp-btn-lg lp-btn-primary" lugar="portada">
                  Crear mi menú en línea
                </CtaEnLinea>
                <LandingDemo href={demoUrl} />
              </div>
              <p className="lp-body" style={{ fontSize: 13.5, marginTop: 14, color: 'var(--u-text-4)' }}>
                {pricing.trialDays} días gratis · sin tarjeta · sin comisión por pedido
              </p>
            </div>
          </div>
        </section>

        {/* ── ¿Te suena? ─────────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead
            eyebrow="¿Te suena?"
            title="Vender por chat funciona… hasta que funciona demasiado"
            lead="Cuando empiezan a llegar pedidos, el chat deja de alcanzar. Y lo que no se anota, se pierde."
            center
          />
          <div className="lp-cols-3" style={{ marginTop: 34 }}>
            {DOLORES.map((d, i) => (
              <div key={d.titulo} className="lp-card el-dolor" data-fx="" style={fx(i)}>
                <span className="el-burbuja-suelta">{d.chat}</span>
                <h3 className="lp-h3" style={{ marginTop: 16 }}>{d.titulo}</h3>
                <p className="lp-body" style={{ fontSize: 13.5, marginTop: 8 }}>{d.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Cómo funciona ──────────────────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <SectionHead
            eyebrow="Así cambia"
            title="Del chat a un pedido ordenado, en tres pasos"
            lead="Sin instalar nada y sin saber de tecnología. Lo armas hoy desde tu celular."
            center
          />
          <div className="lp-steps" style={{ marginTop: 34 }}>
            {PASOS.map((p, i) => (
              <div key={p.titulo} className="lp-card" data-fx="" style={{ padding: '26px 22px', ...fx(i) }}>
                <span className="lp-step-n">{i + 1}</span>
                <h3 className="lp-h3" style={{ marginTop: 16 }}>{p.titulo}</h3>
                <p className="lp-body" style={{ fontSize: 13.5, marginTop: 8 }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Solo lo que necesitas ──────────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <SectionHead
            eyebrow="Solo lo que necesitas"
            title="Simple, porque tu negocio es simple"
            lead="Leogin trae mucho para restaurantes con local. Tú activas lo tuyo y lo demás ni lo ves."
            center
          />
          <div className="el-poda">
            <div className="el-si">
              {SI.map((s, i) => (
                <div key={s.t} className="lp-card lp-card-lift el-si-fila" data-fx="" style={fx(i % 2)}>
                  <span className="lp-icon"><Icon name={s.icon} size={19} /></span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', letterSpacing: '-0.01em' }}>{s.t}</h3>
                    <p className="lp-body" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4 }}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <aside className="lp-card-quiet el-no" data-fx="">
              <div className="lp-eyebrow">Lo que no te va a estorbar</div>
              <ul>
                {NO.map((n) => (
                  <li key={n}><Icon name="minus" size={15} strokeWidth={2.6} /> {n}</li>
                ))}
              </ul>
              <p className="lp-body" style={{ fontSize: 13.5 }}>
                ¿Y si un día abres local? Todo eso ya está aquí: subes de plan y listo, sin cambiar
                de sistema ni volver a subir tu menú.
              </p>
            </aside>
          </div>
        </section>

        {/* ── Por temporadas (Vitrina) ───────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <div className="lp-split">
            <div>
              <div className="lp-eyebrow">¿Vendes por temporadas o ediciones?</div>
              <h2 className="lp-h2" style={{ marginTop: 14 }}>Abre pedidos el lunes. Ciérralos cuando se agote.</h2>
              <p className="lp-lead" style={{ marginTop: 16, fontSize: 16 }}>
                Para postres de autor, cajas de fin de semana o lo que preparas por tandas: la
                estructura Vitrina enseña cada pieza en grande, con cuenta regresiva y cuántas quedan.
                Lo escaso se antoja más.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
                {['Cuenta regresiva', '«Quedan 4 de 30»', 'Avísame cuando abra', 'Archivo de ediciones'].map((t) => (
                  <span key={t} className="lp-chip">{t}</span>
                ))}
              </div>
            </div>
            <div className="lp-split-media" style={{ display: 'flex', justifyContent: 'center' }}>
              <VitrinaMini />
            </div>
          </div>
        </section>

        {/* ── Precio en pequeño ──────────────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <div className="lp-card el-precio" data-fx="crecer">
            <div>
              <div className="lp-eyebrow">Precio fijo, sin comisión</div>
              <div className="el-precio-cifra t-mono">Menos de Q{alDia}<small> al día</small></div>
              <p className="lp-body" style={{ marginTop: 10, maxWidth: 460 }}>
                El plan Estándar, con para recoger y a domicilio, cuesta {estandarLabel}. Vendas
                Q500 o Q50,000 en el mes, lo que vendes es tuyo: no cobramos un porcentaje de tus pedidos.
              </p>
            </div>
            <div className="el-precio-acciones">
              <CtaEnLinea className="lp-btn lp-btn-lg lp-btn-primary" lugar="precio">
                Probar {pricing.trialDays} días gratis
              </CtaEnLinea>
              <Link href="/planes" className="lp-link" style={{ fontSize: 13.5 }}>
                ¿Solo tu catálogo, sin pedidos? El Básico es gratis →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Dudas ──────────────────────────────────────────── */}
        <section className="lp-shell lp-section lp-diferido">
          <SectionHead eyebrow="Dudas" title="Lo que preguntan quienes venden en línea" center />
          <div style={{ maxWidth: 820, margin: '30px auto 0' }}>
            {preguntas.map((f, i) => (
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

        {/* ── Cierre: Leo, la promesa y el botón ─────────────── */}
        <section className="lp-shell lp-section lp-cierre" style={{ paddingBottom: 'clamp(72px, 9vw, 112px)', paddingTop: 56 }}>
          <div style={{ position: 'relative' }}>
            <div className="lp-cierre-leo">
              <Leo id="leo-en-linea" />
            </div>
            <div className="lp-cierre-globo" aria-hidden>¡Tu próximo pedido, ordenado!</div>
            <div className="lp-cierre-banda el-cierre-banda">
              <h2 className="lp-h2" style={{ color: '#F5F3EF' }}>Deja de armar pedidos a mano</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(245,243,239,0.72)', maxWidth: 520, margin: '14px auto 0' }}>
                Sube tu menú hoy y pon el link en tu bio esta misma noche. ¿Prefieres que te
                ayudemos? Escríbenos y lo armamos contigo.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
                <CtaEnLinea className="lp-btn lp-btn-lg lp-btn-primary" lugar="cierre">
                  Crear mi menú en línea
                </CtaEnLinea>
                <a
                  href={contactHref('Hola, vendo comida en línea y quiero ver cómo funciona Leogin')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-btn lp-btn-lg"
                  style={{ background: 'rgba(245,243,239,0.10)', color: '#F5F3EF', borderColor: 'rgba(245,243,239,0.22)' }}
                >
                  <Icon name="whatsapp" size={17} /> Escríbenos
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ── Del chat al pedido ────────────────────────────────────────
   Un bucle de 10 s sin JavaScript: el chat se llena de preguntas
   sueltas, se barre, y en su lugar entra UN pedido completo. Es la
   promesa de la página en una imagen. Solo transform y opacity; con
   «reducir movimiento» se queda el pedido quieto (lo que importa). */
function ChatAPedido() {
  const burbujas = [
    { de: 'Andrea', t: '¿Precio de la docena?' },
    { de: 'Luis', t: '¿Hacen envíos a zona 10?' },
    { de: 'Andrea', t: 'Mándame el menú porfa 🙏' },
    { de: 'Sofía', t: '¿Me repites la cuenta?' },
    { de: 'Luis', t: '¿Ya viene mi pedido?' },
  ];
  return (
    <figure
      className="el-escena"
      aria-label="Un chat lleno de preguntas sueltas se convierte en un solo pedido ordenado: Andrea, a domicilio en zona 10, una docena de cupcakes y un pastel, Q185, paga en efectivo."
    >
      <div className="lp-device lp-device-phone el-telefono">
        <div className="lp-device-screen-phone el-pantalla">
          <div className="el-chat-barra">
            <span className="el-chat-avatar" aria-hidden>D</span>
            <span>
              <b>Dulce Antojo</b>
              <small>47 mensajes sin leer</small>
            </span>
          </div>
          <div className="el-chat">
            {burbujas.map((b, i) => (
              <div key={i} className="el-burbuja" style={{ '--b': i } as CSSProperties}>
                <small>{b.de}</small>
                {b.t}
              </div>
            ))}
          </div>
          <div className="el-pedido">
            <div className="el-aviso"><Icon name="bellRing" size={14} /> Pedido nuevo</div>
            <div className="el-pedido-tarjeta">
              <header>
                <span className="lp-cc-chip">NUEVO</span>
                <span>A domicilio · #034</span>
              </header>
              <strong>Andrea López</strong>
              <ul>
                <li><b>2×</b> Caja de 6 cupcakes</li>
                <li><b>1×</b> Pastel de chocolate</li>
              </ul>
              <p><Icon name="mapPin" size={12} /> Zona 10 · casa verde, portón negro</p>
              <p><Icon name="banknote" size={12} /> Efectivo · paga con Q200</p>
              <footer>
                <span className="t-mono">Q185</span>
                <span className="el-aceptar">Aceptar</span>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ── Una pieza de Vitrina, dibujada ─────────────────────────── */
function VitrinaMini() {
  return (
    <div className="el-vitrina" aria-hidden>
      <div className="el-vitrina-cinta">EDICIÓN Nº 06 · CIERRA EN 2 D 14 H</div>
      {/* Dibujada y no un emoji: el emoji cambia de cara en cada celular. */}
      <div className="el-vitrina-foto">
        <svg viewBox="0 0 200 170">
          <ellipse cx="100" cy="150" rx="86" ry="12" fill="#EDE3D8" />
          <path d="M34 92h132v50a8 8 0 0 1-8 8H42a8 8 0 0 1-8-8z" fill="#FFF4E6" />
          <rect x="34" y="104" width="132" height="10" fill="#F3B6AE" />
          <rect x="34" y="126" width="132" height="10" fill="#F3B6AE" />
          <path d="M30 92c0-12 30-20 70-20s70 8 70 20c0 6-8 10-16 6s-12 6-22 2-14 6-24 2-14 6-24 2-14 6-24 0-14 4-20-2c-6 4-10-2-10-10z" fill="#FFFFFF" />
          <circle cx="62" cy="76" r="11" fill="#E8534A" />
          <circle cx="100" cy="70" r="12" fill="#E8534A" />
          <circle cx="138" cy="76" r="11" fill="#E8534A" />
          <path d="M100 58c-3-6 2-12 8-10" stroke="#2F9E6B" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <div className="el-vitrina-pie">
        <div>
          <b>Tres leches de fresa</b>
          <small>Quedan 4 de 30</small>
        </div>
        <span className="t-mono">Q45</span>
      </div>
      <div className="el-vitrina-barra"><span /></div>
    </div>
  );
}
