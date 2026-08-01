import Link from 'next/link';
import LeoginLogo from '@/components/leogin-logo';

/* ============================================================
   Chrome compartido para páginas legales (términos, privacidad).
   Viven en el dominio raíz → usan el tema por defecto de plataforma.
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
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}><LeoginLogo size={26} /></Link>
      </header>

      <article
        className="anim-fade-up"
        style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' }}
      >
        <div className="t-kicker" style={{ fontSize: 11, marginBottom: 12 }}>Legal</div>
        <h1 className="t-display" style={{ fontSize: 'var(--fs-display)', lineHeight: 1.05 }}>{title}</h1>
        <p className="t-mute" style={{ fontSize: 13, marginTop: 10 }}>Última actualización: {updated}</p>
        {intro && (
          <p className="t-mute" style={{ fontSize: 15, lineHeight: 1.6, marginTop: 16 }}>{intro}</p>
        )}
        <div style={{ marginTop: 8 }}>{children}</div>

        <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 40, paddingTop: 20, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Inicio</Link>
          <Link href="/terminos" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Términos</Link>
          <Link href="/privacidad" className="t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>Privacidad</Link>
        </div>
      </article>
    </main>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 className="t-display" style={{ fontSize: 18, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'baseline' }}>
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
