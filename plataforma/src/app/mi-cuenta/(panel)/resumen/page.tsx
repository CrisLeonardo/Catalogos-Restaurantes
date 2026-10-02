import { redirect } from 'next/navigation';
import { getMyGroupScope, getGroupDashboard } from '@/lib/db/group';
import { adminUrl, subdomainUrl } from '@/lib/tenant';
import { Icon } from '@/components/icons';
import GroupLinkSection from '@/components/mi-cuenta/group-link-section';
import { fmtMoney } from '@/lib/money';
import Kpi from '@/components/mi-cuenta/kpi';

export const metadata = { title: 'Resumen — Leogin' };
export const dynamic = 'force-dynamic';

const money = (n: number) => fmtMoney(n);

/**
 * RESUMEN — cómo va hoy, de un vistazo.
 *
 * Era `/central` en su propio subdominio, con su propio inicio de sesión y
 * solo para cadenas. Los números son los mismos; lo que cambió es quién lo
 * ve: cualquiera con un restaurante propio. Con varios, además, suma.
 */
export default async function ResumenPage() {
  const scope = await getMyGroupScope();
  if (!scope) redirect('/mi-cuenta');

  const dash = await getGroupDashboard(scope.branches);
  const varios = scope.isGroup;

  // Lo que merece una mirada hoy: pausado, agotados o sin una sola venta.
  const alerts = dash.branches.filter((b) => b.paused || b.outStock > 0 || b.todaySales === 0);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div className="t-kicker" style={{ fontSize: 11, marginBottom: 8 }}>{scope.name}</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(22px, 4vw, 28px)', lineHeight: 1.15, margin: 0 }}>
          Resumen de hoy
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Kpi
          label={varios ? 'Ventas hoy · grupo' : 'Ventas hoy'}
          value={money(dash.totalTodaySales)}
          sub={varios ? `${dash.branchCount} restaurantes` : undefined}
          hero
        />
        <Kpi label="Pedidos hoy" value={String(dash.totalTodayOrders)} />
        <Kpi label="Ticket promedio" value={money(dash.avgTicket)} />
        <Kpi label="Ventas 14 días" value={money(dash.sales14)} />
        {varios && dash.best && <Kpi label="Mejor hoy" value={dash.best.name} sub={money(dash.best.todaySales)} small />}
      </div>

      {/* El link único del grupo solo tiene sentido con varios: con uno, el
          link del restaurante ya es ese. */}
      {varios && (
        <GroupLinkSection
          url={scope.org ? subdomainUrl(scope.org.slug) : null}
          groupName={scope.name}
        />
      )}

      {alerts.length > 0 && (
        <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Atención</div>
          {alerts.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon name="alertCircle" size={15} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
              <span style={{ color: 'var(--u-text-2)' }}>
                <strong>{b.name}</strong>:{' '}
                {[
                  b.paused ? 'pedidos pausados' : null,
                  b.outStock > 0 ? `${b.outStock} ${b.outStock === 1 ? 'agotado' : 'agotados'}` : null,
                  b.todaySales === 0 ? 'sin ventas hoy' : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div className="t-kicker" style={{ fontSize: 9.5, padding: '14px 18px 8px' }}>
          {varios ? 'Restaurante por restaurante · hoy' : 'Tu restaurante · hoy'}
        </div>
        {dash.branches.map((b) => (
          <div key={b.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--u-hair)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{b.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>
                {b.todayOrders} pedidos · ticket {money(b.todayTicket)}
                {b.lowStock > 0 ? ` · ${b.lowStock} stock bajo` : ''}
                {b.outStock > 0 ? ` · ${b.outStock} ${b.outStock === 1 ? 'agotado' : 'agotados'}` : ''}
                {b.paused ? ' · pausado' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>{money(b.todaySales)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>14d {money(b.sales14)}</div>
            </div>
            {/* `adminUrl` y no un subdominio a mano: el panel no vive en el
                mismo sitio en local que en producción. */}
            <a
              href={adminUrl(b.slug)}
              className="press glass-quiet"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10, fontSize: 12, color: 'var(--u-text-2)', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Administrar <Icon name="arrowUpRight" size={13} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

