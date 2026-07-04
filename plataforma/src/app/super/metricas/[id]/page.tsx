import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { getRestaurantFullById, getRestaurantDeepMetrics } from '@/lib/db/super-admin';
import { getBillingConfig } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRestaurantFullById(id);
  return { title: `Métricas · ${r?.name ?? 'Restaurante'} — Super Admin` };
}

export default async function RestaurantMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row, m, billing] = await Promise.all([
    getRestaurantFullById(id),
    getRestaurantDeepMetrics(id),
    getBillingConfig(id),
  ]);
  if (!row) notFound();

  const cur = billing?.currency ?? 'GTQ';
  // "Costo por pedido": cuánto te cuesta a TI por cada pedido que el sistema les genera.
  const costPerOrder = billing && billing.monthly_fee > 0 && m.orders30 > 0
    ? billing.monthly_fee / m.orders30 : null;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <Link href="/super/metricas" style={{ fontSize: 13, color: 'var(--u-text-3)', textDecoration: 'none', marginBottom: 10, display: 'inline-block' }}>
          ← Métricas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="t-display" style={{ fontSize: 24 }}>{row.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--u-text-4)', fontFamily: 'monospace' }}>{row.slug}</span>
          <Link href={`/super/restaurantes/${row.id}`} style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--brand-accent)', textDecoration: 'none' }}>
            Gestionar cobro →
          </Link>
        </div>
      </div>

      {/* KPIs con crecimiento */}
      <section>
        <h2 style={sectionTitle}>Afluencia · últimos 30 días</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          <Kpi label="Visitas" value={String(m.visits30)} growth={m.visitsGrowth} />
          <Kpi label="Visitantes únicos" value={String(m.unique30)} />
          <Kpi label="Pedidos" value={String(m.orders30)} growth={m.ordersGrowth} />
          <Kpi label="Su venta" value={fmtMoney(m.revenue30, cur)} growth={m.revenueGrowth} />
          <Kpi label="Conversión" value={`${m.conversion.toFixed(1)}%`} sub="pedidos / visitas" />
          <Kpi label="Ticket promedio" value={fmtMoney(m.avgTicket, cur)} />
        </div>
      </section>

      {/* Gráfica diaria combinada */}
      <section>
        <h2 style={sectionTitle}>Actividad diaria (30 días)</h2>
        <TrendChart series={m.series} currency={cur} />
      </section>

      {/* Evaluación de precio */}
      <section>
        <h2 style={sectionTitle}>Evaluación de cobro</h2>
        <Glass variant="quiet" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {billing && billing.monthly_fee > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                <MiniStat label="Mensualidad actual" value={fmtMoney(billing.monthly_fee, cur)} />
                <MiniStat label="Implementación" value={fmtMoney(billing.setup_fee, cur)} />
                {costPerOrder != null && <MiniStat label="Tu cobro por pedido" value={fmtMoney(costPerOrder, cur)} />}
                <MiniStat
                  label="Mensualidad vs su venta"
                  value={m.revenue30 > 0 ? `${((billing.monthly_fee / m.revenue30) * 100).toFixed(1)}%` : 'n/d'}
                  sub="de lo que ellos facturan"
                />
              </div>
              <PricingHint orders={m.orders30} visits={m.visits30} revenue={m.revenue30} fee={billing.monthly_fee} growth={m.ordersGrowth} />
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
              Este restaurante aún no tiene mensualidad configurada.{' '}
              <Link href={`/super/restaurantes/${row.id}`} style={{ color: 'var(--brand-accent)' }}>
                Configúrala en su ficha
              </Link>{' '}
              para evaluar el cobro contra su afluencia.
            </div>
          )}
        </Glass>
      </section>
    </div>
  );
}

function PricingHint({ orders, visits, revenue, fee, growth }: {
  orders: number; visits: number; revenue: number; fee: number; growth: number | null;
}) {
  let tone = '#94a3b8', text: string;
  const sharePct = revenue > 0 ? (fee / revenue) * 100 : null;

  if (visits < 30 && orders < 5) {
    tone = '#94a3b8';
    text = 'Poca afluencia todavía. Conviene mantener un precio bajo o de arranque hasta que crezca el tráfico; revisa de nuevo en unas semanas.';
  } else if (sharePct != null && sharePct < 1.5 && orders >= 30) {
    tone = '#4ade80';
    text = `Mucha afluencia y tu mensualidad es apenas el ${sharePct.toFixed(1)}% de lo que facturan. Hay margen para subir el precio: les das mucho valor.`;
  } else if (growth != null && growth > 25) {
    tone = '#4ade80';
    text = `Su actividad creció ${growth.toFixed(0)}% vs. el mes anterior. Buen momento para plantear un ajuste de mensualidad acorde al volumen.`;
  } else if (sharePct != null && sharePct > 6) {
    tone = '#fbbf24';
    text = `Tu mensualidad pesa ${sharePct.toFixed(1)}% de su venta: es alto. Si quieres retenerlos, considera un precio más bajo mientras crecen.`;
  } else {
    tone = '#94a3b8';
    text = 'Afluencia y cobro razonablemente equilibrados. Mantén el precio y vuelve a evaluar el próximo mes.';
  }

  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', border: `1px solid ${tone}33` }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: tone, marginTop: 6, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}

function TrendChart({ series, currency }: { series: { date: string; visits: number; orders: number; revenue: number }[]; currency: string }) {
  const maxVisits = Math.max(...series.map((s) => s.visits), 1);
  const maxOrders = Math.max(...series.map((s) => s.orders), 1);
  return (
    <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--u-text-3)' }}>
        <Legend color="color-mix(in srgb, var(--u-text) 18%, transparent)" label="Visitas" />
        <Legend color="var(--brand-accent)" label="Pedidos" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 130 }}>
        {series.map((d, i) => (
          <div key={i} title={`${d.date}: ${d.visits} visitas · ${d.orders} pedidos · ${fmtMoney(d.revenue, currency)}`}
            style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1, minWidth: 0, height: '100%' }}>
            <div style={{ width: '42%', height: `${(d.visits / maxVisits) * 100}%`, minHeight: d.visits > 0 ? 3 : 1, background: 'color-mix(in srgb, var(--u-text) 18%, transparent)', borderRadius: '2px 2px 0 0' }} />
            <div style={{ width: '42%', height: `${(d.orders / maxOrders) * 100}%`, minHeight: d.orders > 0 ? 3 : 1, background: 'var(--brand-accent)', borderRadius: '2px 2px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--u-text-4)' }}>
        <span>{series[0]?.date.slice(5)}</span>
        <span>{series[series.length - 1]?.date.slice(5)}</span>
      </div>
    </Glass>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}

function Kpi({ label, value, sub, growth }: { label: string; value: string; sub?: string; growth?: number | null }) {
  return (
    <Glass variant="quiet" style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--u-text)', lineHeight: 1 }}>{value}</div>
      {growth != null ? (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: growth >= 0 ? '#4ade80' : '#f87171' }}>
          {growth >= 0 ? '▲' : '▼'} {Math.abs(growth).toFixed(0)}% vs. mes previo
        </div>
      ) : sub ? (
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>{sub}</div>
      ) : null}
    </Glass>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--u-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{sub}</div>}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 14, color: 'var(--u-text-2)',
};
