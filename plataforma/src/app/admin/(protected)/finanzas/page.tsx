import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getSalesReport, type Split } from '@/lib/db/reports';
import { getCashSummary, getCashHistory } from '@/lib/actions/finanzas';
import { can } from '@/lib/permissions';
import DateRangeForm from '@/components/admin/date-range-form';
import ExportReportButton from '@/components/admin/export-report-button';
import CashCountForm from '@/components/admin/cash-count-form';
import CashHistoryPanel from '@/components/admin/cash-history-panel';

export const metadata = { title: 'Finanzas – Panel admin' };

/* ============================================================
   /admin/finanzas — reportes financieros + corte de caja
   Ingreso, utilidad, margen y mix de ventas en un rango, más
   el cuadre de efectivo del día.
   ============================================================ */

const money = (n: number) => `Q${n.toFixed(2)}`;

function todayInTz(tz: string): string {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz }); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function AdminFinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'finanzas')) redirect('/admin/menu');

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
      timezone = t?.restaurant.timezone ?? timezone;
      ordersEnabled = (t?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  if (!ordersEnabled) {
    return (
      <div className="glass" style={{ borderRadius: 16, padding: '24px 22px', maxWidth: 560 }}>
        <div className="t-display" style={{ fontSize: 20, marginBottom: 8 }}>Finanzas</div>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
          Los reportes financieros y el corte de caja se basan en los pedidos en línea.
          Activa el módulo <strong>Pedidos</strong> (plan Premium) para empezar a medir
          ingresos, utilidad y margen.
        </p>
      </div>
    );
  }

  const today = todayInTz(timezone);
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : today;
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const [report, cashSummary, cashHistory] = await Promise.all([
    getSalesReport(restaurantId, from, to, timezone),
    getCashSummary(restaurantId),
    getCashHistory(restaurantId, 10),
  ]);

  const maxRevenue = Math.max(...report.series.map((d) => d.revenue), 1);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Rango + export */}
      <div className="glass" style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DateRangeForm from={from} to={to} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ExportReportButton restaurantId={restaurantId} from={from} to={to} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Ingreso" value={money(report.revenue)} sub={`${report.orders} pedidos`} hero />
        <Kpi label="Utilidad" value={money(report.profit)} sub={report.marginPct != null ? `margen ${report.marginPct.toFixed(0)}%` : 'captura costos'} />
        <Kpi label="Costo" value={money(report.cost)} sub="de productos vendidos" />
        <Kpi label="Ticket promedio" value={money(report.avgTicket)} />
        <Kpi label="Envíos" value={money(report.deliveryRevenue)} />
      </div>

      {report.marginPct == null && report.orders > 0 && (
        <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Aún no hay costos capturados en tus productos: la utilidad y el margen aparecerán
          cuando pongas el <strong>Costo</strong> en el editor de cada platillo.
        </div>
      )}

      {/* Gráfica diaria */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Ingreso por día</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {report.series.map((d, i) => {
            const h = (d.revenue / maxRevenue) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <div
                  title={`${d.label}: ${money(d.revenue)} · ${d.orders} pedidos`}
                  style={{
                    width: '100%', height: `${Math.max(h, d.revenue > 0 ? 5 : 1.5)}%`, minHeight: 2,
                    borderRadius: '3px 3px 0 0',
                    background: d.revenue > 0 ? 'var(--brand-accent)' : 'rgba(255,255,255,0.08)',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--u-text-4)' }}>
          <span>{report.series[0]?.label}</span>
          <span>{report.series[report.series.length - 1]?.label}</span>
        </div>
      </div>

      {/* Mix de ventas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SplitCard title="Por canal" rows={report.byChannel} total={report.revenue} />
        <SplitCard title="Por método de pago" rows={report.byPayment} total={report.revenue} />
        {report.byZone.length > 0 && <SplitCard title="Por zona de entrega" rows={report.byZone} total={report.revenue} />}
      </div>

      {/* Top productos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <ProductTable title="Más vendidos (por ingreso)" rows={report.topByRevenue.map((p) => ({ name: p.name, a: `${p.qty}`, b: money(p.revenue) }))} colA="Cant." colB="Ingreso" />
        {report.topByProfit.length > 0 && (
          <ProductTable title="Más rentables (por utilidad)" rows={report.topByProfit.map((p) => ({ name: p.name, a: `${p.qty}`, b: money(p.profit) }))} colA="Cant." colB="Utilidad" />
        )}
      </div>

      {/* Arqueo de caja */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <CashCountForm restaurantId={restaurantId} summary={cashSummary} />
        <CashHistoryPanel history={cashHistory} restaurantId={restaurantId} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}

function SplitCard({ title, rows, total }: { title: string; rows: Split[]; total: number }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r) => {
        const pct = total > 0 ? (r.revenue / total) * 100 : 0;
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--u-text-2)' }}>{r.label}</span>
              <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{money(r.revenue)} · {pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductTable({ title, rows, colA, colB }: { title: string; rows: { name: string; a: string; b: string }[]; colA: string; colB: string }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 90px', gap: 8, fontSize: 9.5, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Producto</span><span style={{ textAlign: 'right' }}>{colA}</span><span style={{ textAlign: 'right' }}>{colB}</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 90px', gap: 8, fontSize: 13, padding: '5px 0', borderTop: i > 0 ? '1px solid var(--u-hair)' : 'none' }}>
              <span style={{ color: 'var(--u-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{r.a}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text)' }}>{r.b}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
