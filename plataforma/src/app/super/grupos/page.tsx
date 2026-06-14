import Link from 'next/link';
import { getAllOrganizations } from '@/lib/db/super-admin';

export const metadata = { title: 'Grupos – Super Admin' };

export default async function SuperGruposPage() {
  const orgs = await getAllOrganizations();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="t-display" style={{ fontSize: 24 }}>Grupos</h1>
        <Link href="/super/grupos/new" className="press btn-accent" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
          + Nuevo grupo
        </Link>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', margin: 0 }}>
        Un grupo agrupa varias sucursales bajo un jefe que las monitorea desde
        <strong> slug-central.tudominio.com</strong>.
      </p>

      {orgs.length === 0 ? (
        <div className="glass" style={{ borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
          No hay grupos todavía.
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {orgs.map((o, i) => (
            <Link key={o.id} href={`/super/grupos/${o.id}`} className="press" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: i > 0 ? '1px solid var(--u-hair)' : 'none', textDecoration: 'none', color: 'inherit' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>{o.name}</div>
                <div className="t-mono" style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>{o.slug}-central</div>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>{o.branchCount} sucursal{o.branchCount === 1 ? '' : 'es'} →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
