import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { StatCard, IncomeChart, EmptyState } from '@/components/super/ui';
import { getFinanceOverview } from '@/lib/db/billing';
import { reminderHref } from '@/lib/reminder';
import { fmtMoney, currencySymbol } from '@/lib/money';
import { fechaCorta } from '@/lib/dates';

export const metadata = { title: 'Finanzas — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function FinanzasResumenPage() {
  const fin = await getFinanceOverview();

  const growth =
    fin.collectedLastMonth > 0
      ? ((fin.collectedThisMonth - fin.collectedLastMonth) / fin.collectedLastMonth) * 100
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10 }}>
        <StatCard
          label="Cobrado este mes"
          value={fmtMoney(fin.collectedThisMonth, fin.currency)}
          icon="checkCircle"
          tone="ok"
          growth={growth}
          sub={growth == null ? `mes pasado: ${fmtMoney(fin.collectedLastMonth, fin.currency)}` : undefined}
        />
        <StatCard label="Ingreso mensual (MRR)" value={fmtMoney(fin.mrr, fin.currency)} icon="wallet" tone="accent" sub={`${fin.activeBilling} ${fin.activeBilling === 1 ? 'restaurante facturando' : 'restaurantes facturando'}`} />
        <StatCard
          label="Pendiente de cobro"
          value={fmtMoney(fin.pendingTotal, fin.currency)}
          icon="clock"
          tone={fin.pendingTotal > 0 ? 'warn' : undefined}
          sub={fin.receivables.length > 0 ? `${fin.receivables.length} ${fin.receivables.length === 1 ? 'restaurante' : 'restaurantes'}` : 'nada pendiente'}
        />
        <StatCard
          label="Vencido"
          value={fmtMoney(fin.overdueTotal, fin.currency)}
          icon="alertCircle"
          tone={fin.overdueTotal > 0 ? 'danger' : undefined}
          sub={fin.overdueTotal > 0 ? 'requiere cobro ya' : 'sin mora'}
        />
        <StatCard label="Cobrado 12 meses" value={fmtMoney(fin.collectedYear, fin.currency)} icon="chart" />
      </div>

      {/* Ingresos por mes */}
      <Card>
        <CardHeader style={{ paddingBottom: 8 }}>
          <CardTitle>Ingresos por mes</CardTitle>
          <CardDescription>Lo que realmente cobraste cada mes (pagos registrados), últimos 12 meses.</CardDescription>
        </CardHeader>
        <CardContent>
          {fin.collectedYear === 0 ? (
            <p className="t-mute" style={{ fontSize: 13, margin: 0 }}>
              Aún no hay pagos registrados. Cuando marques cobros como pagados en Cobranza, aquí verás tu ingreso mes a mes.
            </p>
          ) : (
            <IncomeChart points={fin.incomeByMonth} currencySymbol={currencySymbol(fin.currency)} />
          )}
        </CardContent>
      </Card>

      {/* Cuentas por cobrar + recordatorios */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <Icon name="bellRing" size={16} style={{ color: 'var(--brand-accent-ink)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)', margin: 0 }}>
            Cuentas por cobrar
          </h2>
          {fin.receivables.length > 0 && <Badge variant={fin.overdueTotal > 0 ? 'danger' : 'warn'}>{fin.receivables.length}</Badge>}
        </div>

        {fin.receivables.length === 0 ? (
          <Card style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--c-ok) 14%, transparent)', color: 'var(--c-ok)', flexShrink: 0 }}>
              <Icon name="checkCircle" size={18} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>Nadie te debe nada</div>
              <div className="t-mute" style={{ fontSize: 12.5, marginTop: 2 }}>Todos los cobros emitidos están pagados. 🎉</div>
            </div>
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            {fin.receivables.map((r, i) => {
              const remind = reminderHref(r);
              return (
                <div
                  key={r.restaurantId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', flexWrap: 'wrap',
                    borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                  }}
                >
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link href={`/super/restaurantes/${r.restaurantId}/cobro`} style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </Link>
                      {r.overdueTotal > 0 && <Badge variant="danger" style={{ fontSize: 11 }}>Vencido</Badge>}
                      {r.status === 'suspended' && <Badge variant="neutral" style={{ fontSize: 11 }}>Suspendido</Badge>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3 }}>
                      {r.invoices.length} {r.invoices.length === 1 ? 'cobro pendiente' : 'cobros pendientes'}
                      {r.lastPaidAt ? ` · último pago ${fechaCorta(r.lastPaidAt)}` : ' · nunca ha pagado'}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 15, color: r.overdueTotal > 0 ? 'var(--c-danger)' : 'var(--c-warn)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.pendingTotal, r.currency)}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {remind ? (
                      <Button
                        size="sm"
                        variant={r.overdueTotal > 0 ? 'primary' : 'secondary'}
                        render={<a href={remind.href} target="_blank" rel="noopener noreferrer" />}
                      >
                        <Icon name={remind.kind === 'whatsapp' ? 'whatsapp' : 'mail'} size={14} />
                        Recordar pago
                      </Button>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', alignSelf: 'center' }} title="Agrega WhatsApp o email en la pestaña Información del restaurante">
                        sin contacto
                      </span>
                    )}
                    <Button size="sm" variant="outline" render={<Link href={`/super/restaurantes/${r.restaurantId}/cobro`} />}>
                      Gestionar
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8, lineHeight: 1.5 }}>
          «Recordar pago» abre WhatsApp (o correo) con el mensaje ya escrito: monto, conceptos y fechas.
          Solo revisas y envías.
        </p>
      </section>

      {/* Top clientes */}
      {fin.topClients.length > 0 && (
        <Card>
          <CardHeader style={{ paddingBottom: 6 }}>
            <CardTitle>Tus mejores clientes · 12 meses</CardTitle>
            <CardDescription>Quién te ha pagado más — cuídalos.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column' }}>
            {fin.topClients.map((t, i) => (
              <Link
                key={t.restaurantId}
                href={`/super/restaurantes/${t.restaurantId}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px', textDecoration: 'none',
                  borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 800, fontFamily: 'var(--ui-font-mono)',
                  background: i === 0 ? 'color-mix(in srgb, var(--brand-accent) 16%, transparent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                  color: i === 0 ? 'var(--brand-accent)' : 'var(--u-text-3)',
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--u-text-2)' }}>
                  {fmtMoney(t.paidYear, fin.currency)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {fin.payments.length === 0 && fin.receivables.length === 0 && fin.mrr === 0 && (
        <EmptyState
          icon="wallet"
          title="Todavía no hay movimiento financiero"
          body="Configura la mensualidad de tus restaurantes en su pestaña Cobro y genera los cobros del mes en Cobranza."
        />
      )}
    </div>
  );
}
