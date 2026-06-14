import { redirect } from 'next/navigation';
import { getGroupContext, getGroupDashboard } from '@/lib/db/group';
import { subdomainUrl } from '@/lib/tenant';
import { Icon } from '@/components/icons';

export const metadata = { title: 'Sucursales' };

const money = (n: number) => `Q${n.toFixed(2)}`;

export default async function CentralSucursalesPage() {
  const ctx = await getGroupContext();
  if (!ctx) redirect('/central/login');

  const dash = await getGroupDashboard(ctx.branches);
  const kpiById = new Map(dash.branches.map((b) => [b.id, b]));

  return (
    <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {ctx.branches.map((b) => {
        const k = kpiById.get(b.id);
        const adminUrl = subdomainUrl(`${b.slug}-admin`);
        const menuUrl = subdomainUrl(b.slug);
        const suspended = b.status !== 'active';
        return (
          <div key={b.id} className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--u-text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, color: suspended ? '#f87171' : b.orders_paused ? '#fbbf24' : '#4ade80', background: suspended ? 'rgba(248,113,113,0.12)' : b.orders_paused ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.1)' }}>
                {suspended ? 'Suspendida' : b.orders_paused ? 'Pausada' : 'Activa'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 18 }}>
              <div>
                <div className="t-kicker" style={{ fontSize: 9 }}>Hoy</div>
                <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 17, color: 'var(--u-text)' }}>{money(k?.todaySales ?? 0)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>{k?.todayOrders ?? 0} pedidos</div>
              </div>
              <div>
                <div className="t-kicker" style={{ fontSize: 9 }}>14 días</div>
                <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 17, color: 'var(--u-text)' }}>{money(k?.sales14 ?? 0)}</div>
                <div style={{ fontSize: 10.5, color: (k?.outStock ?? 0) > 0 ? '#f87171' : 'var(--u-text-4)' }}>
                  {(k?.outStock ?? 0) > 0 ? `${k!.outStock} agotados` : (k?.lowStock ?? 0) > 0 ? `${k!.lowStock} stock bajo` : 'inventario ok'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="press" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, background: 'var(--u-text)', color: 'var(--brand-bg)', textDecoration: 'none' }}>
                Administrar <Icon name="arrowUpRight" size={13} />
              </a>
              <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="press glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, color: 'var(--u-text-2)', textDecoration: 'none' }}>
                Ver menú
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
