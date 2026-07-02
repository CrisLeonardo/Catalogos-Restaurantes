import { redirect } from 'next/navigation';
import { getGroupContext, getGroupReport } from '@/lib/db/group';
import DateRangeForm from '@/components/admin/date-range-form';

export const metadata = { title: 'Comparativa' };

const money = (n: number) => `Q${n.toFixed(2)}`;
function todayYmd(): string { return new Date().toLocaleDateString('en-CA'); }
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CentralComparativaPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await getGroupContext();
  if (!ctx) redirect('/central/login');

  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : todayYmd();
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const report = await getGroupReport(ctx.branches, from, to);
  const maxRevenue = Math.max(...report.perBranch.map((b) => b.revenue), 1);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="glass" style={{ borderRadius: 16, padding: 16 }}>
        <DateRangeForm from={from} to={to} basePath="/central/comparativa" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Kpi label="Ingreso del grupo" value={money(report.totalRevenue)} hero />
        <Kpi label="Pedidos" value={String(report.totalOrders)} />
        <Kpi label="Utilidad" value={money(report.totalProfit)} />
      </div>

      {/* Ranking por sucursal */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Ingreso por sucursal</div>
        {report.perBranch.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
        ) : report.perBranch.map((b) => {
          const pct = (b.revenue / maxRevenue) * 100;
          const share = report.totalRevenue > 0 ? (b.revenue / report.totalRevenue) * 100 : 0;
          const m = b.revenue > 0 ? (b.profit / b.revenue) * 100 : null;
          return (
            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--u-text-2)', fontWeight: 600 }}>{b.name}</span>
                <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{money(b.revenue)} · {share.toFixed(0)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>{b.orders} pedidos · utilidad {money(b.profit)}{m != null ? ` · margen ${m.toFixed(0)}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, hero }: { label: string; value: string; hero?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
