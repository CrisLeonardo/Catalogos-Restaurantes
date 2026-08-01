import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
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
        <Link href="/" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
          <LeoginLogo size={26} />
        </Link>
        <nav style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link href="/" className="press t-mute" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Sitio principal
          </Link>
          <Link href="/planes" className="press t-mute" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            Planes
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
        </nav>
      </header>

      <main className="anim-fade-up" style={{ maxWidth: 1040, margin: '0 auto', padding: '8px 18px 80px' }}>
        {/* ── Hero ──────────────────────────────────────────── */}
        <section style={{ position: 'relative', textAlign: 'center', padding: '60px 8px 30px' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: '-20px -20px auto', height: 360,
              background: 'radial-gradient(60% 70% at 50% 0%, color-mix(in srgb, var(--brand-accent) 26%, transparent), transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div className="t-kicker" style={{ fontSize: 11, marginBottom: 18 }}>
            Leogin Desktop
          </div>
          <h1 className="t-display" style={{ fontSize: 'var(--fs-display-xl)', maxWidth: 640, margin: '0 auto', lineHeight: 1.05 }}>
            Tu restaurante, <span style={{ color: 'var(--brand-accent-ink)' }}>instalado</span> en tu PC.
          </h1>
          <p className="t-mute" style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 540, margin: '20px auto 0' }}>
            El mismo panel que ya conoces, pero como una app de verdad: ícono propio, siempre a la mano
            en la bandeja del sistema, con impresión y modo sin internet listos desde adentro.
          </p>

          <div style={{ marginTop: 30 }}>
            <a
              href={DOWNLOAD_HREF}
              className="press btn-accent"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '16px 32px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 16, textDecoration: 'none', color: '#fff',
              }}
            >
              <Icon name="download" size={19} /> Descargar para Windows
            </a>
            <div>
              <span className="t-mute" style={{ fontSize: 12.5, marginTop: 12, display: 'inline-block' }}>
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
              <span key={c.label} className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 99, fontSize: 12.5, color: 'var(--u-text-2)' }}>
                <Icon name={c.icon} size={14} style={{ color: 'var(--brand-accent-ink)' }} /> {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── Vistazo (mockup) ──────────────────────────────── */}
        <section style={{ marginTop: 44 }}>
          <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'center' }}>
            <div>
              <div className="t-kicker" style={{ fontSize: 10, color: 'var(--brand-accent-ink)', marginBottom: 10 }}>Un vistazo</div>
              <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.1 }}>
                Con ventana, bandeja y estado en vivo
              </h2>
              <p className="t-mute" style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, maxWidth: 420 }}>
                Un punto de color en la bandeja te dice si la nube está conectada o si tu restaurante
                está operando con el respaldo local — sin abrir nada para saberlo.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                {['🟢 Nube conectada', '🟡 Modo local activo', 'Instálala en cada PC del local'].map((t) => (
                  <span key={t} className="glass-quiet" style={{ fontSize: 12, color: 'var(--u-text-2)', padding: '7px 13px', borderRadius: 99 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DesktopMockup />
            </div>
          </div>
        </section>

        {/* ── Así de simple ─────────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Así de simple
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Sin códigos que copiar ni direcciones que memorizar — igual de fácil que iniciar sesión en
            cualquier cuenta que ya usas todos los días.
          </p>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {STEPS.map((s) => (
              <Glass key={s.n} variant="quiet" style={{ padding: '24px 20px' }}>
                <div className="t-mono" style={{ fontSize: 13, color: 'var(--brand-accent-ink)', fontWeight: 700 }}>{s.n}</div>
                <h3 className="t-display" style={{ fontSize: 16.5, fontWeight: 700, marginTop: 10 }}>{s.title}</h3>
                <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{s.body}</p>
              </Glass>
            ))}
          </div>

          <div style={{
            marginTop: 16, fontSize: 12.5, color: 'var(--u-text-3)', background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, padding: '12px 16px', lineHeight: 1.55,
            maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <strong style={{ color: 'var(--u-text-2)' }}>Si Windows muestra una pantalla azul</strong> («Windows
            protegió tu PC») al abrir el instalador, haz clic en <strong style={{ color: '#fcd34d' }}>Más
            información → Ejecutar de todos modos</strong>. Es normal en programas nuevos que todavía no
            tienen firma digital — no afecta lo que hace la app.
          </div>
        </section>

        {/* ── Beneficios ─────────────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 6 }}>
            Todo lo que ya haces, más a la mano
          </h2>
          <p className="t-mute" style={{ textAlign: 'center', fontSize: 14, marginBottom: 26 }}>
            Nada nuevo que aprender: el mismo panel, con presencia real en tu PC.
          </p>
          <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {BENEFITS.map((f) => (
              <Glass key={f.title} variant="quiet" style={{ padding: '16px 16px', display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(var(--brand-accent-rgb,99,102,241),0.1)', color: 'var(--brand-accent-ink)' }}>
                  <Icon name={f.icon} size={19} />
                </span>
                <div>
                  <h3 className="t-display" style={{ fontSize: 15, fontWeight: 700 }}>{f.title}</h3>
                  <p className="t-mute" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{f.desc}</p>
                </div>
              </Glass>
            ))}
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────── */}
        <section style={{ marginTop: 64 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-display)', textAlign: 'center', marginBottom: 26 }}>
            Preguntas frecuentes
          </h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 880, margin: '0 auto' }}>
            {FAQS.map((f) => (
              <Glass key={f.q} variant="quiet" style={{ padding: '18px 18px' }}>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="helpCircle" size={16} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, marginTop: 1 }} />
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
              Instálala en la caja, la cocina o donde la necesites
            </h2>
            <p className="t-mute" style={{ fontSize: 15, maxWidth: 460, margin: '12px auto 0', lineHeight: 1.55, position: 'relative' }}>
              Gratis, incluida en tu cuenta de Leogin. Instálala en cada PC del local que quieras — solo
              inicia sesión y listo.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24, position: 'relative' }}>
              <a
                href={DOWNLOAD_HREF}
                className="press btn-accent"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 30px', borderRadius: 'var(--radius-full)',
                  fontWeight: 700, fontSize: 15, textDecoration: 'none', color: '#fff',
                }}
              >
                <Icon name="download" size={17} /> Descargar para Windows
              </a>
              <Link
                href="/registro"
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 28px', borderRadius: 'var(--radius-full)',
                  fontWeight: 600, fontSize: 15, textDecoration: 'none',
                  color: 'var(--u-text)', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)',
                }}
              >
                Aún no tengo cuenta de Leogin
              </Link>
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
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Sitio principal</Link>
            <Link href="/planes" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Planes</Link>
            <Link href="/terminos" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Términos</Link>
            <Link href="/privacidad" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Privacidad</Link>
          </div>
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

/* ── Mockup de la ventana de escritorio (CSS puro, sin imágenes) ── */
function DesktopMockup() {
  const orders = [
    { id: '#128', table: 'Mesa 4', status: 'Preparando', g: 'linear-gradient(135deg,#f59e0b,#b45309)' },
    { id: '#129', table: 'Para llevar', status: 'Nuevo', g: 'linear-gradient(135deg,#e8534a,#f5a030)' },
    { id: '#127', table: 'Mesa 1', status: 'Listo', g: 'linear-gradient(135deg,#22c55e,#15803d)' },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', inset: -30, background: 'radial-gradient(50% 50% at 50% 40%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{
        position: 'relative', width: 380, maxWidth: '100%', borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(160deg,#2a2a2e,#161618)', border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
      }}>
        {/* Barra de título estilo Windows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: '#1C1C1E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="dm-lg" x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse"><stop stopColor="#E8534A" /><stop offset="1" stopColor="#F5A030" /></linearGradient></defs>
              <path d="M27 19 h18 v44 h27 v18 H27 Z" fill="url(#dm-lg)" />
            </svg>
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Leogin</span>
          <span style={{ flex: 1 }} />
          <span style={{ width: 8, height: 8, borderRadius: 99, background: '#4ade80', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }} />
        </div>
        {/* Contenido: tablero de pedidos */}
        <div style={{ padding: '14px 14px 16px', background: 'var(--brand-bg, #0c0c0e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--u-text, #fff)' }}>Pedidos en vivo</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '3px 8px', borderRadius: 99 }}>● Conectado</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 9 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: o.g, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{o.id.replace('#', '')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--u-text, #fff)' }}>{o.id} · {o.table}</div>
                  <div style={{ fontSize: 10, color: 'var(--u-text-3, #999)', marginTop: 1 }}>{o.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
