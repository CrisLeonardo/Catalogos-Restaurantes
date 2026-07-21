import { redirect } from 'next/navigation';
import { getGroupContext, getGroupReport } from '@/lib/db/group';
import DateRangeForm from '@/components/admin/date-range-form';
import GroupFinanceExport from '@/components/central/group-finance-export';

export const metadata = { title: 'Finanzas del grupo' };

const money = (n: number) => `Q${n.toFixed(2)}`;
function todayYmd(): string { return new Date().toLocaleDateString('en-CA'); }
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CentralFinanzasPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await getGroupContext();
  if (!ctx) redirect('/central/login');

  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : todayYmd();
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const report = await getGroupReport(ctx.branches, from, to);
  const maxRev = Math.max(...report.combinedSeries.map((d) => d.revenue), 1);
  const margin = report.totalRevenue > 0 ? (report.totalProfit / report.totalRevenue) * 100 : null;
  // Costo (COGS) y ticket promedio del grupo se derivan del reporte (sin más consultas).
  const cost = report.totalRevenue - report.totalProfit;
  const avgTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="glass" style={{ borderRadius: 16, padding: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <DateRangeForm from={from} to={to} basePath="/central/finanzas" />
        {report.perBranch.length > 0 && (
          <GroupFinanceExport from={from} to={to} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Ingreso del grupo" value={money(report.totalRevenue)} hero />
        <Kpi label="Costo (COGS)" value={money(cost)} />
        <Kpi label="Utilidad" value={money(report.totalProfit)} sub={margin != null ? `margen ${margin.toFixed(0)}%` : undefined} />
        <Kpi label="Ticket promedio" value={money(avgTicket)} />
        <Kpi label="Pedidos" value={String(report.totalOrders)} />
      </div>

      {/* Serie combinada */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Ingreso diario del grupo</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {report.combinedSeries.map((d, i) => {
            const h = (d.revenue / maxRev) * 100;
            return (
              <div key={i} title={`${d.label}: ${money(d.revenue)}`} style={{ flex: 1, minWidth: 0, height: `${Math.max(h, d.revenue > 0 ? 5 : 1.5)}%`, minHeight: 2, borderRadius: '3px 3px 0 0', background: d.revenue > 0 ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)' }} />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--u-text-4)' }}>
          <span>{report.combinedSeries[0]?.label}</span>
          <span>{report.combinedSeries[report.combinedSeries.length - 1]?.label}</span>
        </div>
      </div>

      {/* Contribución por sucursal — con margen y ticket promedio (P&L por sucursal) */}
      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 100px', gap: 8, padding: '12px 18px', fontSize: 9.5, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Sucursal</span><span style={{ textAlign: 'right' }}>Ingreso</span><span style={{ textAlign: 'right' }}>Pedidos</span><span style={{ textAlign: 'right' }}>Utilidad</span>
        </div>
        {report.perBranch.map((b) => {
          const m = b.revenue > 0 ? (b.profit / b.revenue) * 100 : null;
          const ticket = b.orders > 0 ? b.revenue / b.orders : 0;
          return (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 100px', gap: 8, padding: '11px 18px', borderTop: '1px solid var(--u-hair)', fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: 'var(--u-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text)' }}>{money(b.revenue)}</span>
              <div style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>
                {b.orders}
                <div style={{ fontSize: 10, color: 'var(--u-text-4)' }}>{money(ticket)} c/u</div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>
                {money(b.profit)}
                <div style={{ fontSize: 10, color: m != null && m < 0 ? '#f87171' : 'var(--u-text-4)' }}>{m != null ? `${m.toFixed(0)}% margen` : '—'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}
