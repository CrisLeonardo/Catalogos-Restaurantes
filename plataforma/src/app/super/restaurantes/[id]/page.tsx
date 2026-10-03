import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { StatCard, SavedBanner, ActivityChart } from '@/components/super/ui';
import { getRestaurantFullById, getRestaurantUsers, getRestaurantDeepMetrics } from '@/lib/db/super-admin';
import { getBillingConfig, getInvoices, isOnTrial, trialDaysLeft, isOverdue, planLabel } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  return { title: `${row?.name ?? 'Restaurante'} — Super Admin` };
}

/* Resumen: el "estado de salud" del restaurante de un vistazo, con
   accesos directos a la pestaña donde se arregla cada cosa. */

export default async function FichaResumenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const [billing, invoices, users, metrics] = await Promise.all([
    getBillingConfig(id),
    getInvoices(id),
    getRestaurantUsers(id),
    getRestaurantDeepMetrics(id),
  ]);

  const currency = billing?.currency ?? 'GTQ';
  const pending = invoices.filter((i) => i.status === 'PENDING');
  const pendingTotal = pending.reduce((s, i) => s + i.amount, 0);
  const hasOverdue = pending.some((i) => isOverdue(i));
  const onTrial = isOnTrial(billing);
  const feeConfigured = !!billing && billing.monthly_fee > 0;

  // Lo que requiere acción, en orden de urgencia.
  const todos: { icon: string; tone: 'danger' | 'warn' | 'info'; text: string; href: string; cta: string }[] = [];
  if (hasOverdue) {
    todos.push({ icon: 'alertCircle', tone: 'danger', text: `Tiene pagos vencidos por ${fmtMoney(pendingTotal, currency)}.`, href: `/super/restaurantes/${id}/cobro`, cta: 'Gestionar cobro' });
  } else if (pendingTotal > 0) {
    todos.push({ icon: 'clock', tone: 'warn', text: `Tiene ${fmtMoney(pendingTotal, currency)} pendientes de pago.`, href: `/super/restaurantes/${id}/cobro`, cta: 'Ver cobros' });
  }
  if (onTrial && trialDaysLeft(billing) <= 5) {
    todos.push({ icon: 'clock', tone: 'info', text: `Su prueba gratis termina en ${trialDaysLeft(billing)} ${trialDaysLeft(billing) === 1 ? 'día' : 'días'} — buen momento para confirmar su plan.`, href: `/super/restaurantes/${id}/cobro`, cta: 'Ver cobro' });
  }
  if (!feeConfigured && !onTrial && row.status === 'active') {
    todos.push({ icon: 'wallet', tone: 'warn', text: 'Está activo pero no tiene mensualidad configurada.', href: `/super/restaurantes/${id}/cobro`, cta: 'Configurar' });
  }
  if (users.length === 0) {
    todos.push({ icon: 'userPlus', tone: 'info', text: 'Aún no tiene ningún acceso creado — el dueño no puede entrar a su panel.', href: `/super/restaurantes/${id}/accesos`, cta: 'Crear acceso' });
  }

  const owner = users.find((u) => u.role === 'RESTAURANT_OWNER');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isNew && (
        <SavedBanner message="Restaurante creado. Configura el plan, el tema y crea el acceso del dueño en las pestañas de arriba." />
      )}

      {/* Pendientes */}
      {todos.length > 0 && (
        <Card style={{ overflow: 'hidden' }}>
          {todos.map((t, i) => (
            <div
              key={t.text}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
                background: `color-mix(in srgb, var(--c-${t.tone === 'info' ? 'ok' : t.tone}) 13%, transparent)`,
                color: t.tone === 'info' ? 'var(--adm-info, #7dd3fc)' : `var(--c-${t.tone})`,
              }}>
                <Icon name={t.icon} size={16} />
              </span>
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--u-text-2)' }}>{t.text}</span>
              <Button variant="outline" size="sm" render={<Link href={t.href} />}>{t.cta}</Button>
            </div>
          ))}
        </Card>
      )}

      {/* KPIs de negocio + cobro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard
          label="Mensualidad"
          value={feeConfigured ? fmtMoney(billing!.monthly_fee, currency) : '—'}
          icon="wallet"
          tone={feeConfigured ? 'accent' : undefined}
          sub={onTrial ? `en prueba · ${trialDaysLeft(billing)}d restantes` : feeConfigured ? `plan ${planLabel(row.plan_actual)}` : 'sin configurar'}
          href={`/super/restaurantes/${id}/cobro`}
        />
        <StatCard
          label="Pendiente de pago"
          value={pendingTotal > 0 ? fmtMoney(pendingTotal, currency) : 'Q0'}
          icon={hasOverdue ? 'alertCircle' : 'clock'}
          tone={hasOverdue ? 'danger' : pendingTotal > 0 ? 'warn' : 'ok'}
          sub={hasOverdue ? 'con cobros vencidos' : pendingTotal > 0 ? `${pending.length} ${pending.length === 1 ? 'cobro' : 'cobros'}` : 'al día'}
          href={`/super/restaurantes/${id}/cobro`}
        />
        <StatCard label="Visitas 30 días" value={metrics.visits30.toLocaleString('es-GT')} icon="eye" growth={metrics.visitsGrowth} />
        <StatCard label="Pedidos 30 días" value={metrics.orders30.toLocaleString('es-GT')} icon="bag" growth={metrics.ordersGrowth} />
        <StatCard label="Su venta 30 días" value={fmtMoney(metrics.revenue30, currency)} icon="chart" growth={metrics.revenueGrowth} sub={metrics.orders30 > 0 ? `ticket prom. ${fmtMoney(metrics.avgTicket, currency)}` : undefined} />
        <StatCard label="Accesos" value={users.length} icon="users" sub={owner?.email ?? 'sin dueño creado'} href={`/super/restaurantes/${id}/accesos`} />
      </div>

      {/* Actividad 30 días */}
      {(metrics.visits30 > 0 || metrics.orders30 > 0) && (
        <Card style={{ padding: '18px 20px' }}>
          <div className="t-kicker" style={{ fontSize: 11, marginBottom: 12 }}>Actividad · 30 días</div>
          <ActivityChart series={metrics.series} height={110} />
        </Card>
      )}

      {/* Sin las cuatro tarjetas «Adónde ir»: eran las mismas pestañas de
          arriba otra vez, doble navegación (auditoría 2026-10-02, SUP-06). */}
    </div>
  );
}
