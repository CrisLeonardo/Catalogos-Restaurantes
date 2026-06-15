import Link from 'next/link';
import { Glass } from '@/components/glass';
import { getBillingDashboard } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';
import GenerateMonthlyButton from '@/components/super/generate-monthly-button';

export const metadata = { title: 'Cobros — Super Admin' };
export const dynamic = 'force-dynamic';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[(m - 1) % 12]} ${y}`;
}

export default async function CobrosPage() {
  const { rows, stats, period } = await getBillingDashboard();

  // Ordena por urgencia: vencidos → pendientes del mes → con cobro activo → resto.
  const rank = (r: (typeof rows)[number]) => {
    if (r.hasOverdue) return 0;
    if (r.currentMonthlyStatus === 'PENDING') return 1;
    if (r.config?.active && r.config.monthly_fee > 0) return 2;
    if (r.config) return 3;
    return 4;
  };
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-display" style={{ fontSize: 24, marginBottom: 6 }}>Cobros</h1>
          <p className="t-mute" style={{ fontSize: 14 }}>
            Mensualidades y pagos de tus restaurantes · periodo {periodLabel(period)}
          </p>
        </div>
        <GenerateMonthlyButton />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <Kpi label="Ingreso mensual (MRR)" value={fmtMoney(stats.mrr, stats.currency)} color="#f08060" />
        <Kpi label="Cobrado este mes" value={fmtMoney(stats.collectedThisMonth, stats.currency)} color="#4ade80" />
        <Kpi label="Pendiente de cobro" value={fmtMoney(stats.pendingTotal, stats.currency)} color="#fbbf24" />
        <Kpi label="Con pagos vencidos" value={String(stats.overdueCount)} color={stats.overdueCount > 0 ? '#f87171' : undefined} />
        <Kpi label="Cobro activo" value={String(stats.activeBilling)} />
      </div>

      {/* Tabla */}
      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 14, color: 'var(--u-text-2)' }}>
          Restaurantes
        </h2>
        <Glass variant="quiet" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                {['Restaurante', 'Mensualidad', 'Mes actual', 'Pendiente', 'Visitas 30d', 'Pedidos 30d', 'Su venta 30d', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const cur = r.config?.currency ?? stats.currency;
                return (
                  <tr key={r.restaurantId} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--u-hair)' : 'none' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <Link href={`/super/restaurantes/${r.restaurantId}`} style={{ fontWeight: 600, color: 'var(--u-text)', textDecoration: 'none' }}>
                        {r.name}
                      </Link>
                      <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontFamily: 'monospace' }}>
                        {r.slug}{r.status === 'suspended' ? ' · suspendido' : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-2)' }}>
                      {r.config && r.config.monthly_fee > 0 ? (
                        <span>{fmtMoney(r.config.monthly_fee, cur)}{!r.config.active && <span style={{ color: 'var(--u-text-4)' }}> (pausado)</span>}</span>
                      ) : (
                        <span style={{ color: 'var(--u-text-4)', fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>sin configurar</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <MonthBadge hasOverdue={r.hasOverdue} status={r.currentMonthlyStatus} hasMonthly={r.hasCurrentMonthly} configured={!!r.config && r.config.monthly_fee > 0 && r.config.active} />
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: r.pendingTotal > 0 ? '#fbbf24' : 'var(--u-text-4)' }}>
                      {r.pendingTotal > 0 ? fmtMoney(r.pendingTotal, cur) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{r.visits30}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{r.orders30}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{fmtMoney(r.salesRevenue30, cur)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/super/metricas/${r.restaurantId}`} style={{ fontSize: 12.5, color: 'var(--u-text-3)', textDecoration: 'none', marginRight: 12 }}>
                        Métricas
                      </Link>
                      <Link href={`/super/restaurantes/${r.restaurantId}`} style={{ fontSize: 12.5, color: 'var(--brand-accent)', textDecoration: 'none' }}>
                        Gestionar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Glass>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 10, lineHeight: 1.5 }}>
          «Su venta 30d» es lo que el restaurante facturó a sus clientes (su negocio), útil para evaluar si subir o bajar su mensualidad según la afluencia. Tu cobro es la columna «Mensualidad».
        </p>
      </section>
    </div>
  );
}

function MonthBadge({ hasOverdue, status, hasMonthly, configured }: {
  hasOverdue: boolean; status: string | null; hasMonthly: boolean; configured: boolean;
}) {
  let label: string, color: string, bg: string;
  if (hasOverdue) { label = 'VENCIDO'; color = '#f87171'; bg = 'rgba(248,113,113,0.13)'; }
  else if (status === 'PAID') { label = 'PAGADO'; color = '#4ade80'; bg = 'rgba(74,222,128,0.12)'; }
  else if (status === 'PENDING') { label = 'PENDIENTE'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; }
  else if (!configured) { label = '—'; color = 'var(--u-text-4)'; bg = 'transparent'; }
  else if (!hasMonthly) { label = 'SIN GENERAR'; color = 'var(--u-text-3)'; bg = 'rgba(255,255,255,0.05)'; }
  else { label = '—'; color = 'var(--u-text-4)'; bg = 'transparent'; }
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: bg, color, letterSpacing: '0.05em' }}>
      {label}
    </span>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Glass variant="quiet" style={{ padding: '16px 16px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: color ?? 'var(--u-text)', lineHeight: 1.1, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 500 }}>{label}</div>
    </Glass>
  );
}
