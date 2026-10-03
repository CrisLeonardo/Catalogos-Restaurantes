import { redirect } from 'next/navigation';
import { getMyGroupScope, getGroupReport } from '@/lib/db/group';
import DateRangeForm from '@/components/admin/date-range-form';
import { fmtMoney } from '@/lib/money';
import Kpi from '@/components/mi-cuenta/kpi';

export const metadata = { title: 'Comparativa — Leogin' };
export const dynamic = 'force-dynamic';

const money = (n: number) => fmtMoney(n);
function todayYmd(): string { return new Date().toLocaleDateString('en-CA'); }
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** COMPARATIVA — quién vende más, y cuánto pesa cada uno en el total. */
export default async function ComparativaPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const scope = await getMyGroupScope();
  if (!scope?.isGroup) redirect('/mi-cuenta');

  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : todayYmd();
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const report = await getGroupReport(scope.branches, from, to);
  const maxRevenue = Math.max(...report.perBranch.map((b) => b.revenue), 1);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-3)', marginBottom: 8 }}>{scope.name}</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(22px, 4vw, 28px)', lineHeight: 1.15, margin: 0 }}>
          Comparativa
        </h1>
      </div>

      <div className="glass" style={{ borderRadius: 16, padding: 16 }}>
        <DateRangeForm from={from} to={to} basePath="/mi-cuenta/comparativa" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Kpi label="Ingreso del grupo" value={money(report.totalRevenue)} hero />
        <Kpi label="Pedidos" value={String(report.totalOrders)} />
        <Kpi label="Utilidad" value={money(report.totalProfit)} />
      </div>

      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-3)' }}>Ingreso por restaurante</div>
        {report.perBranch.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
        ) : report.perBranch.map((b) => {
          const pct = (b.revenue / maxRevenue) * 100;
          const share = report.totalRevenue > 0 ? (b.revenue / report.totalRevenue) * 100 : 0;
          const m = b.marginPct;
          return (
            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 10 }}>
                <span style={{ color: 'var(--u-text-2)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)', whiteSpace: 'nowrap' }}>{money(b.revenue)} · {share.toFixed(0)}%</span>
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

