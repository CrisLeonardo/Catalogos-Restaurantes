import { SiteHeader, SiteFooter } from '@/components/site-chrome';

/* ============================================================
   Chrome compartido para páginas legales (términos, privacidad).
   Viven en el dominio raíz → tema claro de plataforma
   (html[data-platform], ver globals.css).

   La cabecera y el pie son los MISMOS del resto del sitio: antes estas
   páginas solo tenían un logo suelto arriba y tres enlaces abajo, así que
   quien llegaba a los términos desde Google se quedaba sin manera de volver
   al producto.
   ============================================================ */

export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main style={{ minHeight: '60svh' }}>
        <article
          className="anim-fade-up"
          style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) 20px 80px' }}
        >
          <div className="lp-eyebrow">Legal</div>
          <h1 className="lp-h1" style={{ fontSize: 'clamp(30px, 4.4vw, 46px)', marginTop: 14 }}>{title}</h1>
          <p className="lp-body" style={{ fontSize: 13, marginTop: 12, color: 'var(--u-text-4)' }}>
            Última actualización: {updated}
          </p>
          {intro && <p className="lp-lead" style={{ fontSize: 16, marginTop: 18 }}>{intro}</p>}
          <div style={{ marginTop: 10 }}>{children}</div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 className="lp-h3" style={{ fontSize: 19, display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <span className="t-mono" style={{ fontSize: 13, color: 'var(--brand-accent-ink)' }}>{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--u-text-2)' }}>{children}</p>;
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.6, color: 'var(--u-text-2)' }}>
          <span style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, marginTop: 1 }}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
