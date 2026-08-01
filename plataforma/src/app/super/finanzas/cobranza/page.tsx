import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Icon } from '@/components/icons';
import { PlanChip } from '@/components/super/ui';
import { getBillingDashboard, isOnTrial, trialDaysLeft, planLabel } from '@/lib/db/billing';
import { setRestaurantStatusSuper } from '@/lib/actions/super-admin';
import { fmtMoney } from '@/lib/money';
import GenerateMonthlyButton from '@/components/super/generate-monthly-button';

export const metadata = { title: 'Cobranza — Super Admin' };
export const dynamic = 'force-dynamic';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[(m - 1) % 12]} ${y}`;
}

export default async function CobranzaPage() {
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

  // Restaurantes activos con mora vencida → candidatos a suspensión manual
  const needsSuspension = sorted.filter((r) => r.hasOverdue && r.status === 'active');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
          Periodo <strong style={{ color: 'var(--u-text)' }}>{periodLabel(period)}</strong> ·{' '}
          {fmtMoney(stats.collectedThisMonth, stats.currency)} cobrado ·{' '}
          <span style={{ color: stats.pendingTotal > 0 ? 'var(--c-warn)' : 'var(--u-text-3)' }}>
            {fmtMoney(stats.pendingTotal, stats.currency)} pendiente
          </span>
        </p>
        <GenerateMonthlyButton />
      </div>

      {/* Alerta suspensión manual */}
      {needsSuspension.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <Icon name="alertCircle" size={16} style={{ color: 'var(--c-danger)' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--c-danger)', margin: 0 }}>
              Con mora vencida y aún activos
            </h2>
            <Badge variant="danger">{needsSuspension.length}</Badge>
          </div>
          <Card style={{ overflow: 'hidden' }}>
            {needsSuspension.map((r, i) => (
              <div
                key={r.restaurantId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', gap: 16, flexWrap: 'wrap',
                  borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', marginBottom: 3 }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
                    Plan {planLabel(r.plan)} · pendiente{' '}
                    <span style={{ fontFamily: 'var(--ui-font-mono)', color: 'var(--c-danger)' }}>
                      {fmtMoney(r.pendingTotal, r.config?.currency ?? 'GTQ')}
                    </span>
                    {' · mora vencida'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="outline" size="sm" render={<Link href={`/super/restaurantes/${r.restaurantId}/cobro`} />}>
                    Ver cobros
                  </Button>
                  <form action={setRestaurantStatusSuper}>
                    <input type="hidden" name="id" value={r.restaurantId} />
                    <input type="hidden" name="status" value="suspended" />
                    <Button variant="destructive" size="sm" type="submit">
                      Suspender ahora
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
          <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8, lineHeight: 1.5 }}>
            «Suspender ahora» pausa su menú público de inmediato. Al registrar su pago se reactiva solo.
          </p>
        </section>
      )}

      {/* Tabla */}
      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--u-text)' }}>
          Restaurantes
        </h2>
        <Table style={{ minWidth: 760 }}>
          <TableHeader>
            <TableRow style={{ borderTop: 'none' }}>
              <TableHead>Restaurante</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Mensualidad</TableHead>
              <TableHead>Mes actual</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead className="text-right">Su venta 30d</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const cur = r.config?.currency ?? stats.currency;
              const trial = isOnTrial(r.config);
              return (
                <TableRow key={r.restaurantId}>
                  <TableCell>
                    <Link href={`/super/restaurantes/${r.restaurantId}/cobro`} style={{ fontWeight: 600, color: 'var(--u-text)', textDecoration: 'none' }}>
                      {r.name}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)', marginTop: 2 }}>
                      {r.slug}{r.status === 'suspended' ? ' · suspendido' : ''}
                    </div>
                  </TableCell>
                  <TableCell><PlanChip plan={r.plan} /></TableCell>
                  <TableCell style={{ fontFamily: 'var(--ui-font-mono)', whiteSpace: 'nowrap' }}>
                    {r.config && r.config.monthly_fee > 0 ? (
                      <span>
                        {fmtMoney(r.config.monthly_fee, cur)}
                        {!r.config.active && !trial && <span style={{ color: 'var(--u-text-4)' }}> (pausado)</span>}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-sans)', fontSize: 12.5 }}>sin configurar</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {trial ? (
                      <Badge variant="info" style={{ fontSize: 10 }}>Prueba · {trialDaysLeft(r.config)}d</Badge>
                    ) : (
                      <MonthBadge
                        hasOverdue={r.hasOverdue}
                        status={r.currentMonthlyStatus}
                        hasMonthly={r.hasCurrentMonthly}
                        configured={!!r.config && r.config.monthly_fee > 0 && r.config.active}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right" style={{ fontFamily: 'var(--ui-font-mono)', color: r.pendingTotal > 0 ? 'var(--c-warn)' : 'var(--u-text-4)' }}>
                    {r.pendingTotal > 0 ? fmtMoney(r.pendingTotal, cur) : '—'}
                  </TableCell>
                  <TableCell className="text-right" style={{ fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{fmtMoney(r.salesRevenue30, cur)}</TableCell>
                  <TableCell className="text-right" style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/super/metricas/${r.restaurantId}`} style={{ fontSize: 12.5, color: 'var(--u-text-3)', textDecoration: 'none', marginRight: 12 }}>
                      Métricas
                    </Link>
                    <Link href={`/super/restaurantes/${r.restaurantId}/cobro`} style={{ fontSize: 12.5, color: 'var(--brand-accent-ink)', textDecoration: 'none', fontWeight: 600 }}>
                      Gestionar
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 10, lineHeight: 1.5 }}>
          «Su venta 30d» es lo que el restaurante facturó a sus clientes (su negocio), útil para evaluar si
          subir o bajar su mensualidad según la afluencia. Tu cobro es la columna «Mensualidad».
        </p>
      </section>
    </div>
  );
}

function MonthBadge({ hasOverdue, status, hasMonthly, configured }: {
  hasOverdue: boolean; status: string | null; hasMonthly: boolean; configured: boolean;
}) {
  if (hasOverdue) return <Badge variant="danger" style={{ fontSize: 10 }}>Vencido</Badge>;
  if (status === 'PAID') return <Badge variant="ok" style={{ fontSize: 10 }}>Pagado</Badge>;
  if (status === 'PENDING') return <Badge variant="warn" style={{ fontSize: 10 }}>Pendiente</Badge>;
  if (!configured) return <span style={{ color: 'var(--u-text-4)' }}>—</span>;
  if (!hasMonthly) return <Badge variant="neutral" style={{ fontSize: 10 }}>Sin generar</Badge>;
  return <span style={{ color: 'var(--u-text-4)' }}>—</span>;
}
