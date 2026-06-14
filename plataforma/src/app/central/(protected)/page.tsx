import { redirect } from 'next/navigation';
import { getGroupContext, getGroupDashboard } from '@/lib/db/group';
import { subdomainUrl } from '@/lib/tenant';
import { Icon } from '@/components/icons';

export const metadata = { title: 'Resumen del grupo' };

const money = (n: number) => `Q${n.toFixed(2)}`;

export default async function CentralDashboardPage() {
  const ctx = await getGroupContext();
  if (!ctx) redirect('/central/login');

  const dash = await getGroupDashboard(ctx.branches);

  if (ctx.branches.length === 0) {
    return (
      <div className="glass" style={{ borderRadius: 16, padding: '24px 22px', maxWidth: 560 }}>
        <div className="t-display" style={{ fontSize: 20, marginBottom: 8 }}>Aún no hay sucursales</div>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
          Pídele a Leogin que asigne tus restaurantes a este grupo. En cuanto haya
          sucursales, aquí verás el consolidado de todas.
        </p>
      </div>
    );
  }

  // Alertas: sucursales pausadas o con agotados.
  const alerts = dash.branches.filter((b) => b.paused || b.outStock > 0 || b.todaySales === 0);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs consolidados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Kpi label="Ventas hoy · grupo" value={money(dash.totalTodaySales)} sub={`${dash.branchCount} sucursales`} hero />
        <Kpi label="Pedidos hoy" value={String(dash.totalTodayOrders)} />
        <Kpi label="Ticket promedio" value={money(dash.avgTicket)} />
        <Kpi label="Ventas 14 días" value={money(dash.sales14)} />
        {dash.best && <Kpi label="Mejor sucursal hoy" value={dash.best.name} sub={money(dash.best.todaySales)} small />}
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Atención</div>
          {alerts.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon name="alertCircle" size={15} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <span style={{ color: 'var(--u-text-2)' }}>
                <strong>{b.name}</strong>:{' '}
                {[b.paused ? 'pedidos pausados' : null, b.outStock > 0 ? `${b.outStock} agotado(s)` : null, b.todaySales === 0 ? 'sin ventas hoy' : null].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de sucursales */}
      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div className="t-kicker" style={{ fontSize: 9.5, padding: '14px 18px 8px' }}>Sucursales · hoy</div>
        {dash.branches.map((b, i) => {
          const adminUrl = subdomainUrl(`${b.slug}-admin`);
          return (
            <div key={b.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--u-hair)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{b.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>
                  {b.todayOrders} pedidos · ticket {money(b.todayTicket)}
                  {b.lowStock > 0 ? ` · ${b.lowStock} stock bajo` : ''}
                  {b.paused ? ' · pausado' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>{money(b.todaySales)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>14d {money(b.sales14)}</div>
              </div>
              <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="press glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10, fontSize: 12, color: 'var(--u-text-2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Administrar <Icon name="arrowUpRight" size={13} />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hero, small }: { label: string; value: string; sub?: string; hero?: boolean; small?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: small ? 16 : hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.1, whiteSpace: small ? 'nowrap' : undefined, overflow: small ? 'hidden' : undefined, textOverflow: small ? 'ellipsis' : undefined }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}
