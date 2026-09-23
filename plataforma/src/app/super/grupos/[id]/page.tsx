import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrganizationDetail } from '@/lib/db/super-admin';
import { assignRestaurantToOrg, unassignRestaurant, deleteOrganization } from '@/lib/actions/super-admin';
import { subdomainUrl } from '@/lib/tenant';

export const metadata = { title: 'Grupo – Super Admin' };

export default async function GrupoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, branches, available, owners } = await getOrganizationDetail(id);
  if (!org) notFound();

  // El link PÚBLICO del grupo: el que reparte al cliente a la sucursal más
  // cercana. El panel del jefe ya no vive en un subdominio aparte — es una
  // sección de su Mi cuenta, y solo él entra ahí.
  const publicUrl = subdomainUrl(org.slug);

  const card: React.CSSProperties = { borderRadius: 16, padding: 20 };
  const sectionTitle: React.CSSProperties = { fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/super/grupos" className="press t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>← Grupos</Link>
      <div>
        <h1 className="t-display" style={{ fontSize: 26 }}>{org.name}</h1>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="t-mono" style={{ fontSize: 13, color: 'var(--brand-accent-ink)', textDecoration: 'none' }}>
          {org.slug} · link de pedidos del grupo →
        </a>
      </div>

      {/* Sucursales del grupo */}
      <div className="glass" style={card}>
        <div style={sectionTitle}>Sucursales del grupo ({branches.length})</div>
        {branches.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--u-text-4)', margin: 0 }}>Aún no hay sucursales asignadas.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {branches.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--u-text)' }}>{b.name} <span className="t-mono" style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>· {b.slug}</span></span>
                <form action={unassignRestaurant}>
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="restaurantId" value={b.id} />
                  <button type="submit" className="press" style={{ fontSize: 12, color: 'var(--c-danger)', background: 'none', border: '1px solid var(--c-danger-line)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>Quitar</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {/* Asignar sucursal */}
        {available.length > 0 && (
          <form action={assignRestaurantToOrg} style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--u-hair)' }}>
            <input type="hidden" name="orgId" value={org.id} />
            {/* Fondo adaptativo (antes #1a1a1a fijo → caja oscura con el panel en modo claro). */}
            <select name="restaurantId" required defaultValue="" style={{ flex: 1, background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' }}>
              <option value="" disabled style={{ background: '#fff', color: '#888' }}>Agregar una sucursal…</option>
              {available.map((r) => <option key={r.id} value={r.id} style={{ background: '#fff', color: '#111' }}>{r.name} ({r.slug})</option>)}
            </select>
            <button type="submit" className="press glass-quiet" style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--u-text-2)' }}>Asignar</button>
          </form>
        )}
      </div>

      {/* Quién lo administra — informativo. Crear aquí una cuenta de "jefe de
          grupo" a mano era el modelo viejo; hoy quien abre los restaurantes
          es ya su dueño y ve el consolidado en su propia Mi cuenta. */}
      <div className="glass" style={card}>
        <div style={sectionTitle}>Quién lo administra</div>
        {owners.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--u-text-4)', margin: 0 }}>
            Nadie tiene este grupo en su perfil todavía.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {owners.map((o) => (
              <div key={o.id} style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>
                {o.full_name ? `${o.full_name} · ` : ''}<span className="t-mono" style={{ color: 'var(--u-text-3)' }}>{o.email}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eliminar */}
      <form action={deleteOrganization} style={{ marginTop: 8 }}>
        <input type="hidden" name="id" value={org.id} />
        <button type="submit" className="press" style={{ fontSize: 13, color: 'var(--c-danger)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', borderRadius: 'var(--radius-md)', padding: '10px 16px', cursor: 'pointer' }}>
          Eliminar grupo (las sucursales quedan independientes)
        </button>
      </form>
    </div>
  );
}
