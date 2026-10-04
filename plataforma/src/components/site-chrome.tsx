import Link from 'next/link';
import { Icon } from '@/components/icons';
import { conEvento, EVENTOS } from '@/lib/analytics';
import LeoginLogo from '@/components/leogin-logo';
import SiteMenu from '@/components/site-menu';
import LeoginInstallBanner from '@/components/leogin-install-banner';
import { subdomainUrl, DEMO_SLUG } from '@/lib/tenant';

/**
 * Cabecera y pie del SITIO PÚBLICO de Leogin (distleogin.com).
 *
 * Antes cada página de plataforma se dibujaba su propia cabecera: la landing
 * tenía cinco enlaces + "Acceder" + CTA, /planes solo el logo y un botón,
 * /descargas otra variante, y los legales ninguna. Navegar entre ellas se
 * sentía como saltar entre tres sitios distintos. Aquí vive una sola.
 *
 * Server component a propósito: no hay estado, así que el sitio comercial no
 * paga JavaScript de cliente por su propio chrome.
 */

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';
const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP; // solo dígitos, con código de país

/** Enlace de contacto: WhatsApp si hay número configurado, si no correo. */
export function contactHref(msg = 'Hola, quiero una demo de Leogin para mi restaurante') {
  return CONTACT_WA
    ? `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`
    : `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(msg)}`;
}

export const CONTACT_MAIL = CONTACT_EMAIL;

/**
 * `home` decide si los enlaces de sección apuntan a anclas de esta misma
 * página (landing) o de vuelta a "/". Sin esto, "Funciones" en /planes
 * hacía scroll a ninguna parte.
 */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const demoUrl = subdomainUrl(DEMO_SLUG);
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  return (
    <header className="lp-header">
      <div className="lp-header-inner">
        <Link href="/" aria-label="Leogin — inicio" style={{ flex: '0 0 auto', textDecoration: 'none' }}>
          <LeoginLogo size={27} />
        </Link>
        <nav aria-label="Navegación principal" className="lp-nav">
          <a href={anchor('producto')} className="lp-navlink">Producto</a>
          <a href={anchor('capacidades')} className="lp-navlink">Funciones</a>
          <Link href="/planes" className="lp-navlink">Planes</Link>
          <a href={demoUrl} className="lp-navlink">Demo</a>
          <Link href="/descargas" className="lp-navlink">Escritorio</Link>
          <Link href="/login" className="lp-btn lp-btn-sm lp-btn-soft lp-nav-secondary" style={{ marginLeft: 8 }}>
            Acceder
          </Link>
          <Link href="/registro" {...conEvento('lp-btn lp-btn-sm lp-btn-primary', EVENTOS.clicCrear, 'cabecera')} style={{ marginLeft: 6 }}>
            <span className="lp-cta-full">Crear mi restaurante</span>
            <span className="lp-cta-short">Crear cuenta</span>
          </Link>
          {/* En el teléfono los cinco enlaces de arriba se ocultan; aquí es a
              donde se van (antes no iban a ningún sitio). */}
          <SiteMenu home={home} demoUrl={demoUrl} />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ home = false }: { home?: boolean }) {
  const demoUrl = subdomainUrl(DEMO_SLUG);
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  return (
    <footer style={{ borderTop: '1px solid var(--lp-line)', background: 'color-mix(in srgb, #ffffff 70%, transparent)' }}>
      {/* Quien todavía no es cliente: instalar AQUÍ es correcto, no hay
          panel propio al que mandarlo. Ver leogin-install-banner.tsx. */}
      <LeoginInstallBanner />
      <div className="lp-shell" style={{ padding: '48px 20px 32px' }}>
        <div className="lp-footer-grid">
          <div>
            <LeoginLogo size={24} />
            <p className="lp-body" style={{ fontSize: 13.5, marginTop: 12, maxWidth: 280 }}>
              El sistema para restaurantes hecho en Guatemala: menú digital, pedidos, cocina y
              caja en un solo lugar.
            </p>
            <a
              href={contactHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-sm lp-btn-soft"
              style={{ marginTop: 18 }}
            >
              <Icon name="whatsapp" size={15} /> Hablar con nosotros
            </a>
          </div>

          <FooterCol title="Producto">
            <a href={anchor('capacidades')} className="lp-footer-link">Funciones</a>
            <Link href="/planes" className="lp-footer-link">Planes y precios</Link>
            <a href={demoUrl} className="lp-footer-link">Demo en vivo</a>
            <Link href="/descargas" className="lp-footer-link">Leogin Escritorio</Link>
          </FooterCol>

          <FooterCol title="Tu cuenta">
            <Link href="/registro" className="lp-footer-link">Crear restaurante</Link>
            <Link href="/login" className="lp-footer-link">Acceder al panel</Link>
            <Link href="/mi-cuenta" className="lp-footer-link">Mi cuenta</Link>
          </FooterCol>

          <FooterCol title="Legal">
            <Link href="/terminos" className="lp-footer-link">Términos</Link>
            <Link href="/privacidad" className="lp-footer-link">Privacidad</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="lp-footer-link">Contacto</a>
          </FooterCol>
        </div>

        <div
          style={{
            marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--lp-line)',
            display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span className="lp-body" style={{ fontSize: 12.5 }}>
            © {new Date().getFullYear()} Leogin · Todos los derechos reservados
          </span>
          {/* Bandera dibujada y no el emoji 🇬🇹: Windows no pinta banderas
              emoji y se leía «GT Hecho en Guatemala» (WEB-05). */}
          <span className="lp-body" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden style={{ borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.12)' }}>
              <rect width="6" height="12" fill="#4997D0" />
              <rect x="6" width="6" height="12" fill="#ffffff" />
              <rect x="12" width="6" height="12" fill="#4997D0" />
            </svg>
            Hecho en Guatemala
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="t-kicker" style={{ fontSize: 10, marginBottom: 10, color: 'var(--u-text-4)' }}>{title}</div>
      <nav aria-label={title}>{children}</nav>
    </div>
  );
}

/** Encabezado de sección reutilizable (kicker + título + entradilla). */
export function SectionHead({
  eyebrow, title, lead, center = false,
}: {
  eyebrow: string; title: string; lead?: string; center?: boolean;
}) {
  return (
    <div style={center ? { textAlign: 'center', maxWidth: 620, margin: '0 auto' } : undefined}>
      <div className="lp-eyebrow">{eyebrow}</div>
      <h2 className="lp-h2" style={{ marginTop: 14 }}>{title}</h2>
      {lead && (
        <p className="lp-lead" style={{ marginTop: 14, fontSize: 16, ...(center ? {} : { maxWidth: 620 }) }}>
          {lead}
        </p>
      )}
    </div>
  );
}
