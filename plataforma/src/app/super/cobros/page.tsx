import Link from 'next/link';
import { Glass } from '@/components/glass';
import { getBillingDashboard, isOnTrial, trialDaysLeft, planLabel, planGmvLimit } from '@/lib/db/billing';
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

  const gmvOverLimit = sorted.filter((r) => {
    const limit = planGmvLimit(r.plan);
    return limit !== null && r.salesRevenue30 > limit;
  });

  // Restaurantes activos con mora vencida → requieren suspensión manual
  const needsSuspension = sorted.filter(
    (r) => r.hasOverdue && r.status === 'active',
  );

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
        <Kpi label="Sobre límite GMV" value={String(gmvOverLimit.length)} color={gmvOverLimit.length > 0 ? '#fb923c' : undefined} />
      </div>

      {/* Alerta suspensión manual */}
      {needsSuspension.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#f87171', margin: 0 }}>
              Requieren suspensión manual
            </h2>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(248,113,113,0.13)', color: '#f87171' }}>
              {needsSuspension.length}
            </span>
          </div>
          <Glass variant="quiet" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {needsSuspension.map((r, i) => (
              <div
                key={r.restaurantId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', gap: 16,
                  borderBottom: i < needsSuspension.length - 1 ? '1px solid var(--u-hair)' : 'none',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', marginBottom: 3 }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
                    Plan {planLabel(r.plan)} · pendiente{' '}
                    <span style={{ fontFamily: 'var(--ui-font-mono)', color: '#f87171' }}>
                      {fmtMoney(r.pendingTotal, r.config?.currency ?? 'GTQ')}
                    </span>
                    {' · mora vencida'}
                  </div>
                </div>
                <Link
                  href={`/super/restaurantes/${r.restaurantId}`}
                  style={{ fontSize: 13, fontWeight: 600, color: '#f87171', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Suspender →
                </Link>
              </div>
            ))}
          </Glass>
          <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8 }}>
            Estos restaurantes tienen pagos vencidos y siguen activos. La suspensión automática está desactivada — suspéndelos manualmente desde su ficha.
          </p>
        </section>
      )}

      {/* Alertas GMV */}
      {gmvOverLimit.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#fb923c', margin: 0 }}>
              Superaron límite GMV
            </h2>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(251,146,60,0.13)', color: '#fb923c' }}>
              {gmvOverLimit.length}
            </span>
          </div>
          <Glass variant="quiet" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {gmvOverLimit.map((r, i) => {
              const limit = planGmvLimit(r.plan)!;
              const pct = Math.round((r.salesRevenue30 / limit) * 100);
              return (
                <div
                  key={r.restaurantId}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', gap: 16,
                    borderBottom: i < gmvOverLimit.length - 1 ? '1px solid var(--u-hair)' : 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', marginBottom: 3 }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
                      Plan {planLabel(r.plan)} · límite{' '}
                      <span style={{ fontFamily: 'var(--ui-font-mono)' }}>Q{limit.toLocaleString()}</span>
                      {' · '}venta{' '}
                      <span style={{ fontFamily: 'var(--ui-font-mono)', color: '#fb923c' }}>Q{r.salesRevenue30.toLocaleString()}</span>
                      {' · '}{pct}% del límite
                    </div>
                  </div>
                  <Link
                    href={`/super/restaurantes/${r.restaurantId}`}
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-accent)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Gestionar →
                  </Link>
                </div>
              );
            })}
          </Glass>
          <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8 }}>
            Estos restaurantes superaron su límite GMV mensual este mes. Contáctalos para ajustar su plan.
          </p>
        </section>
      )}

      {/* Tabla */}
      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 14, color: 'var(--u-text-2)' }}>
          Restaurantes
        </h2>
        <Glass variant="quiet" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                {['Restaurante', 'Plan', 'Mensualidad', 'Mes actual', 'Pendiente', 'Visitas 30d', 'Pedidos 30d', 'Su venta 30d', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const cur = r.config?.currency ?? stats.currency;
                const trial = isOnTrial(r.config);
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
                    <td style={{ padding: '12px 14px' }}>
                      <PlanBadge plan={r.plan} gmv={r.salesRevenue30} />
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-2)' }}>
                      {r.config && r.config.monthly_fee > 0 ? (
                        <span>{fmtMoney(r.config.monthly_fee, cur)}{!r.config.active && !trial && <span style={{ color: 'var(--u-text-4)' }}> (pausado)</span>}</span>
                      ) : (
                        <span style={{ color: 'var(--u-text-4)', fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>sin configurar</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {trial ? (
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(129,140,248,0.14)', color: '#818cf8', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                          PRUEBA · {trialDaysLeft(r.config)}d
                        </span>
                      ) : (
                        <MonthBadge hasOverdue={r.hasOverdue} status={r.currentMonthlyStatus} hasMonthly={r.hasCurrentMonthly} configured={!!r.config && r.config.monthly_fee > 0 && r.config.active} />
                      )}
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
  else if (!hasMonthly) { label = 'SIN GENERAR'; color = 'var(--u-text-3)'; bg = 'color-mix(in srgb, var(--u-text) 5%, transparent)'; }
  else { label = '—'; color = 'var(--u-text-4)'; bg = 'transparent'; }
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: bg, color, letterSpacing: '0.05em' }}>
      {label}
    </span>
  );
}

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  BASICO:        { bg: 'rgba(148,163,184,0.13)', color: '#94a3b8' },
  PREMIUM:       { bg: 'rgba(99,102,241,0.13)',  color: '#6366f1' },
  PREMIUM_PRO:   { bg: 'rgba(168,85,247,0.13)',  color: '#a855f7' },
  PREMIUM_ULTRA: { bg: 'rgba(20,184,166,0.13)',  color: '#14b8a6' },
  ALTO_VOLUMEN:  { bg: 'rgba(249,115,22,0.13)',  color: '#f97316' },
  VARIABLE:      { bg: 'rgba(245,158,11,0.13)',  color: '#f59e0b' },
};

function PlanBadge({ plan, gmv }: { plan: string; gmv: number }) {
  const colors = PLAN_COLORS[plan] ?? { bg: 'rgba(148,163,184,0.13)', color: '#94a3b8' };
  const limit = planGmvLimit(plan);
  const isOver = limit !== null && gmv > limit;
  const isNear = limit !== null && !isOver && gmv > limit * 0.8;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: colors.bg, color: colors.color, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        {planLabel(plan)}
      </span>
      {isOver && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(248,113,113,0.13)', color: '#f87171', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          SUPERA LÍMITE
        </span>
      )}
      {isNear && (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(251,191,36,0.13)', color: '#fbbf24', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          CERCA DEL LÍMITE
        </span>
      )}
    </div>
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
