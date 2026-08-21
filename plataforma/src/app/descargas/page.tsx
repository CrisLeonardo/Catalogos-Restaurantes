import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { SiteHeader, SiteFooter, SectionHead } from '@/components/site-chrome';
import { DesktopPlatformNotice } from '@/components/desktop-platform-notice';

export const metadata: Metadata = {
  title: 'Leogin Desktop — la app de escritorio de tu restaurante',
  description:
    'Descarga Leogin Desktop para Windows: tu panel como una app instalada, con impresión, modo cocina y respaldo sin internet. Inicia sesión con tu cuenta de Leogin y listo.',
  robots: { index: true, follow: true },
};

const DOWNLOAD_HREF = '/api/desktop/download-exe';

const BENEFITS = [
  {
    icon: 'monitor',
    title: 'Una app de verdad, no una pestaña',
    desc: 'Ícono en el menú Inicio y en la bandeja del sistema. Sigue corriendo aunque la cierres — minimizarla no corta nada.',
  },
  {
    icon: 'key',
    title: 'Reconoce tu restaurante solo',
    desc: 'Inicias sesión con tu correo y contraseña de siempre. Nada de códigos que copiar ni direcciones que escribir a mano.',
  },
  {
    icon: 'flame',
    title: 'Modo cocina a pantalla completa',
    desc: 'Un acceso directo abre el KDS en modo kiosco, sin bandeja ni menús — ideal para una pantalla dedicada.',
  },
  {
    icon: 'plug',
    title: 'Sigue funcionando sin internet',
    desc: 'Si la nube se corta, tu restaurante sigue tomando pedidos e imprimiendo con el respaldo local, sin que tu equipo lo note.',
  },
  {
    icon: 'upload',
    title: 'Se actualiza sola',
    desc: 'Cuando hay una versión nueva, un aviso discreto te deja elegir «Reiniciar ahora» o «Después» — nunca a media comanda.',
  },
  {
    icon: 'print',
    title: 'Imprime sin complicaciones',
    desc: 'Conecta la impresora del local en un clic desde adentro de la app, sin descargar nada aparte ni copiar tokens.',
  },
];

const STEPS = [
  { n: '01', title: 'Descarga e instala', body: 'Un solo .exe, sin permisos de administrador. Doble clic y en unos segundos está lista.' },
  { n: '02', title: 'Inicia sesión con tu cuenta', body: 'El mismo correo y contraseña de siempre. La app reconoce sola a qué restaurante perteneces.' },
  { n: '03', title: 'Ya estás en tu panel', body: 'Tu panel de siempre, ahora como una app instalada: bandeja, atajos e impresión listos desde adentro.' },
];

const FAQS = [
  { q: '¿Tiene un costo aparte?', a: 'No. Leogin Desktop está incluido en tu cuenta de Leogin — no es un producto ni un cargo separado.' },
  { q: '¿Necesito crear otra cuenta para usarla?', a: 'No. Es la misma cuenta con la que ya entras a tu panel desde el navegador.' },
  { q: '¿Funciona si se corta el internet?', a: 'Sí. Si la nube no responde, el respaldo local de tu restaurante sigue tomando pedidos e imprimiendo, y todo se sincroniza solo al volver la conexión.' },
  { q: '¿Windows me va a mostrar una advertencia al instalar?', a: 'La primera vez, sí — Windows marca como «Editor no reconocido» cualquier programa nuevo que todavía no tiene firma digital (la nuestra está en camino). Haz clic en «Más información → Ejecutar de todos modos». Es una advertencia por ser nuevo, no una señal de que algo esté mal.' },
  { q: '¿Hay versión para Mac?', a: 'Todavía no — por ahora Leogin Desktop es solo para Windows. En Mac puedes seguir usando tu panel normalmente desde el navegador, sin perder ninguna función.' },
  { q: '¿Cómo la desinstalo?', a: 'Como cualquier programa de Windows: Configuración → Aplicaciones → Leogin → Desinstalar. Se quita por completo, sin dejar residuos.' },
];

export default function DescargasPage() {
  return (
    <div style={{ width: '100%' }}>
      <SiteHeader />

      <main className="anim-fade-up">
        {/* ── Portada ───────────────────────────────────────── */}
        <section className="lp-shell" style={{ textAlign: 'center', padding: 'clamp(48px, 7vw, 88px) 20px clamp(28px, 4vw, 40px)' }}>
          <div className="lp-eyebrow">Leogin Escritorio</div>
          <h1 className="lp-h1" style={{ fontSize: 'clamp(34px, 5.4vw, 58px)', marginTop: 16, maxWidth: 760, marginInline: 'auto' }}>
            Tu restaurante, <span style={{ color: 'var(--brand-accent-ink)' }}>instalado</span> en tu PC.
          </h1>
          <p className="lp-lead" style={{ margin: '18px auto 0', maxWidth: 560 }}>
            El mismo panel que ya conoces, pero como una app de verdad: ícono propio, siempre a la mano
            en la bandeja del sistema, con impresión y modo sin internet listos desde adentro.
          </p>

          <div style={{ marginTop: 30 }}>
            <a href={DOWNLOAD_HREF} className="lp-btn lp-btn-lg lp-btn-primary">
              <Icon name="download" size={19} /> Descargar para Windows
            </a>
            <div>
              <span className="lp-body" style={{ fontSize: 13, marginTop: 14, display: 'inline-block', color: 'var(--u-text-4)' }}>
                Windows 10/11 (64 bits) · gratis · sin tarjeta · sin conocimientos técnicos
              </span>
            </div>
            <DesktopPlatformNotice />
          </div>

          {/* Tira de confianza */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            {[
              { icon: 'key', label: 'Reconoce tu restaurante solo' },
              { icon: 'plug', label: 'Funciona sin internet' },
              { icon: 'upload', label: 'Se actualiza sola' },
              { icon: 'print', label: 'Impresión en un clic' },
            ].map((c) => (
              <span key={c.label} className="lp-chip">
                <Icon name={c.icon} size={14} style={{ color: 'var(--brand-accent-ink)' }} /> {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── Vistazo (mockup) ──────────────────────────────── */}
        <section className="lp-shell lp-section">
          <div className="lp-split">
            <div>
              <div className="lp-eyebrow">Un vistazo</div>
              <h2 className="lp-h2" style={{ marginTop: 14 }}>
                Con ventana, bandeja y estado en vivo
              </h2>
              <p className="lp-lead" style={{ marginTop: 16, fontSize: 16 }}>
                Un punto de color en la bandeja te dice si la nube está conectada o si tu restaurante
                está operando con el respaldo local — sin abrir nada para saberlo.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
                {['🟢 Nube conectada', '🟡 Modo local activo', 'Instálala en cada PC del local'].map((t) => (
                  <span key={t} className="lp-chip">{t}</span>
                ))}
              </div>
            </div>
            <div className="lp-split-media" style={{ display: 'flex', justifyContent: 'center' }}>
              <DesktopMockup />
            </div>
          </div>
        </section>

        {/* ── Así de simple ─────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead
            eyebrow="Instalación"
            title="Así de simple"
            lead="Sin códigos que copiar ni direcciones que memorizar: igual de fácil que iniciar sesión en cualquier cuenta que ya usas todos los días."
            center
          />
          <div className="lp-steps" style={{ marginTop: 32 }}>
            {STEPS.map((s) => (
              <div key={s.n} className="lp-card" style={{ padding: '26px 22px' }}>
                <span className="lp-step-n">{s.n.replace('0', '')}</span>
                <h3 className="lp-h3" style={{ marginTop: 16 }}>{s.title}</h3>
                <p className="lp-body" style={{ fontSize: 13.5, marginTop: 8 }}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* Aviso de SmartScreen. Antes iba en ámbar -300 sobre ámbar al 8 %:
              sobre fondo claro eso era amarillo-sobre-blanco (~2:1). Con los
              tokens --c-warn* el mismo aviso se resuelve al ámbar oscuro en
              claro y al vivo en oscuro, sin mantener dos paletas. */}
          <div
            style={{
              marginTop: 20, maxWidth: 680, marginInline: 'auto',
              fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-2)',
              background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)',
              borderRadius: 14, padding: '14px 18px',
            }}
          >
            <strong style={{ color: 'var(--c-warn)' }}>Si Windows muestra una pantalla azul</strong> («Windows
            protegió tu PC») al abrir el instalador, haz clic en <strong style={{ color: 'var(--c-warn)' }}>Más
            información → Ejecutar de todos modos</strong>. Es normal en programas nuevos que todavía no
            tienen firma digital — no afecta lo que hace la app.
          </div>
        </section>

        {/* ── Beneficios ─────────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead
            eyebrow="Qué ganas"
            title="Todo lo que ya haces, más a la mano"
            lead="Nada nuevo que aprender: el mismo panel, con presencia real en tu PC."
            center
          />
          <div className="lp-cols" style={{ marginTop: 32 }}>
            {BENEFITS.map((f) => (
              <div key={f.title} className="lp-card lp-card-lift" style={{ padding: '18px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', borderRadius: 18 }}>
                <span className="lp-icon"><Icon name={f.icon} size={19} /></span>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p className="lp-body" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────── */}
        <section className="lp-shell lp-section">
          <SectionHead eyebrow="Dudas" title="Preguntas frecuentes" center />
          <div style={{ maxWidth: 820, margin: '26px auto 0' }}>
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

        {/* ── CTA final ─────────────────────────────────────── */}
        <section className="lp-shell lp-section" style={{ paddingBottom: 'clamp(72px, 9vw, 112px)' }}>
          <div
            style={{
              position: 'relative', overflow: 'hidden', borderRadius: 28, textAlign: 'center',
              padding: 'clamp(40px, 6vw, 64px) clamp(24px, 4vw, 48px)',
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
                Instálala en la caja, la cocina o donde la necesites
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(245,243,239,0.72)', maxWidth: 480, margin: '14px auto 0' }}>
                Gratis, incluida en tu cuenta de Leogin. Instálala en cada PC del local que quieras:
                solo inicia sesión y listo.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
                <a href={DOWNLOAD_HREF} className="lp-btn lp-btn-lg lp-btn-primary">
                  <Icon name="download" size={17} /> Descargar para Windows
                </a>
                <Link
                  href="/registro"
                  className="lp-btn lp-btn-lg"
                  style={{ background: 'rgba(245,243,239,0.10)', color: '#F5F3EF', borderColor: 'rgba(245,243,239,0.22)' }}
                >
                  Aún no tengo cuenta de Leogin
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ── Mockup de la ventana de escritorio (CSS puro, sin imágenes) ── */
function DesktopMockup() {
  /* La ventana va CLARA: el panel real de Leogin va claro desde el rediseño
     2026-07-12, y este mockup antes leía --brand-bg/--u-text del tema, que en
     la web nueva ya resuelven a claro — pero las filas seguían con relleno
     `rgba(255,255,255,0.04)`, o sea blanco sobre blanco: los pedidos
     desaparecían. Ahora los colores de la "captura" son explícitos y no
     dependen de la paleta de la página. */
  const orders = [
    { id: '#128', table: 'Mesa 4',      status: 'Preparando', g: 'linear-gradient(135deg,#e0873b,#b45309)' },
    { id: '#129', table: 'Para llevar', status: 'Nuevo',      g: 'linear-gradient(135deg,#e8534a,#f5a030)' },
    { id: '#127', table: 'Mesa 1',      status: 'Listo',      g: 'linear-gradient(135deg,#3fa76b,#15803d)' },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440 }}>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(68% 62% at 50% 42%, color-mix(in srgb, var(--brand-accent) 18%, transparent), transparent 72%)',
          pointerEvents: 'none',
        }}
      />
      <div className="lp-device lp-device-desk">
        <div className="lp-device-screen-desk" style={{ background: '#f4f4f6' }}>
          {/* Barra de título estilo Windows */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff', borderBottom: '1px solid rgba(23,22,26,0.08)' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: '#1C1C1E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="dm-lg" x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse"><stop stopColor="#E8534A" /><stop offset="1" stopColor="#F5A030" /></linearGradient></defs>
                <path d="M27 19 h18 v44 h27 v18 H27 Z" fill="url(#dm-lg)" />
              </svg>
            </span>
            <span style={{ fontSize: 11, fontWeight: 650, color: 'rgba(23,22,26,0.62)' }}>Leogin</span>
            <span style={{ flex: 1 }} />
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: '#2f9e63', boxShadow: '0 0 0 3px rgba(47,158,99,0.16)' }} />
          </div>

          {/* Contenido: tablero de pedidos */}
          <div style={{ padding: '14px 14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#17161a' }}>Pedidos en vivo</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#157347', background: 'rgba(21,115,71,0.10)', padding: '4px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>● Conectado</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.map((o) => (
                <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid rgba(23,22,26,0.07)', borderRadius: 12, padding: 9 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: o.g, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{o.id.replace('#', '')}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#17161a' }}>{o.id} · {o.table}</div>
                    <div style={{ fontSize: 10, color: 'rgba(23,22,26,0.6)', marginTop: 2 }}>{o.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
