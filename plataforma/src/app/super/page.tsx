import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { PageHeader, StatCard, PlanChip, StatusChip, ActivityChart, EmptyState, PLAN_DOT } from '@/components/super/ui';
import { getAllRestaurants, getGlobalMetrics, getPlatformDailySeries } from '@/lib/db/super-admin';
import { getBillingDashboard, isOnTrial, trialDaysLeft, planLabel, type BillingRow } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';

export const metadata = { title: 'Inicio — Super Admin' };
export const dynamic = 'force-dynamic';

type Alert = {
  key: string;
  tone: 'danger' | 'warn' | 'info';
  icon: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

function buildAlerts(rows: BillingRow[]): Alert[] {
  const alerts: Alert[] = [];

  for (const r of rows) {
    if (r.hasOverdue && r.status === 'active') {
      alerts.push({
        key: `overdue-${r.restaurantId}`,
        tone: 'danger',
        icon: 'alertCircle',
        title: `${r.name} tiene pagos vencidos`,
        body: `Pendiente ${fmtMoney(r.pendingTotal, r.config?.currency ?? 'GTQ')} · plan ${planLabel(r.plan)} · sigue activo`,
        href: `/super/restaurantes/${r.restaurantId}/cobro`,
        cta: 'Gestionar',
      });
    }
  }
  for (const r of rows) {
    if (r.status === 'active' && isOnTrial(r.config)) {
      const days = trialDaysLeft(r.config);
      if (days <= 5) {
        alerts.push({
          key: `trial-${r.restaurantId}`,
          tone: 'info',
          icon: 'clock',
          title: `La prueba de ${r.name} termina en ${days} día${days === 1 ? '' : 's'}`,
          body: 'Buen momento para escribirle y confirmar su plan antes de que venza.',
          href: `/super/restaurantes/${r.restaurantId}`,
          cta: 'Ver ficha',
        });
      }
    }
  }
  for (const r of rows) {
    const configured = !!r.config && r.config.monthly_fee > 0;
    if (r.status === 'active' && !configured && !isOnTrial(r.config)) {
      alerts.push({
        key: `nofee-${r.restaurantId}`,
        tone: 'warn',
        icon: 'wallet',
        title: `${r.name} no tiene mensualidad configurada`,
        body: 'Está activo pero no genera cobro mensual. Configura su tarifa en la ficha.',
        href: `/super/restaurantes/${r.restaurantId}/cobro`,
        cta: 'Configurar',
      });
    }
  }
  return alerts;
}

export default async function SuperHomePage() {
  const [{ rows, stats }, metrics, series, restaurants] = await Promise.all([
    getBillingDashboard(),
    getGlobalMetrics(),
    getPlatformDailySeries(),
    getAllRestaurants(),
  ]);

  const visits30 = rows.reduce((s, r) => s + r.visits30, 0);
  const orders30 = rows.reduce((s, r) => s + r.orders30, 0);
  const alerts = buildAlerts(rows);
  const recent = restaurants.slice(0, 5);
  const top = [...rows].sort((a, b) => b.orders30 - a.orders30 || b.visits30 - a.visits30).slice(0, 5);
  const trials = rows.filter((r) => isOnTrial(r.config)).length;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <PageHeader
        subtitle="Cómo va Leogin hoy: ingresos, actividad de los restaurantes y lo que requiere tu atención."
        actions={
          /* Sin «Nuevo grupo»: crear grupos a mano se retiró (el grupo nace
             solo cuando un dueño abre su segundo restaurante, ver
             /super/grupos) y el botón llevaba a una página 404. */
          <Button size="sm" render={<Link href="/super/restaurantes/new" />}>
            <Icon name="plus" size={15} /> Nuevo restaurante
          </Button>
        }
      />

      {/* KPIs principales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 10 }}>
        <StatCard label="Ingreso mensual (MRR)" value={fmtMoney(stats.mrr, stats.currency)} icon="wallet" tone="accent" href="/super/finanzas" />
        <StatCard label="Cobrado este mes" value={fmtMoney(stats.collectedThisMonth, stats.currency)} icon="checkCircle" tone="ok" href="/super/finanzas" />
        {/* Con todo lo pendiente ya vencido, «Pendiente de cobro» y «Pagos
            vencidos» decían lo mismo: el primero dice ahora de cuántos
            restaurantes es y si ya venció todo (auditoría 2026-10-02, SUP-10). */}
        <StatCard
          label="Pendiente de cobro"
          value={fmtMoney(stats.pendingTotal, stats.currency)}
          icon="clock"
          tone={stats.pendingTotal > 0 ? 'warn' : undefined}
          sub={(() => {
            const deudores = rows.filter((r) => r.pendingTotal > 0);
            if (deudores.length === 0) return 'nada pendiente';
            if (deudores.every((r) => r.hasOverdue)) return 'todo ya vencido';
            return `de ${deudores.length} ${deudores.length === 1 ? 'restaurante' : 'restaurantes'}`;
          })()}
          href="/super/finanzas"
        />
        <StatCard label="Pagos vencidos" value={stats.overdueCount} icon="alertCircle" tone={stats.overdueCount > 0 ? 'danger' : undefined} sub={stats.overdueCount > 0 ? 'requieren acción' : 'todo al día'} href="/super/finanzas" />
        <StatCard label="Restaurantes activos" value={`${metrics.active}/${metrics.total}`} icon="utensils" sub={trials > 0 ? `${trials} en prueba` : undefined} href="/super/restaurantes" />
        <StatCard label="Pedidos 30 días" value={orders30.toLocaleString('es-GT')} icon="bag" sub={`${visits30.toLocaleString('es-GT')} visitas`} href="/super/metricas" />
      </div>

      {/* Atención requerida */}
      <section>
        <SectionTitle icon="bellRing" title="Requiere tu atención" count={alerts.length} />
        {alerts.length === 0 ? (
          <Card style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--c-ok) 14%, transparent)', color: 'var(--c-ok)', flexShrink: 0 }}>
              <Icon name="checkCircle" size={18} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>Todo en orden</div>
              <div className="t-mute" style={{ fontSize: 12.5, marginTop: 2 }}>Sin pagos vencidos, pruebas por vencer ni restaurantes sin cobro configurado.</div>
            </div>
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            {alerts.slice(0, 6).map((a, i) => (
              <div
                key={a.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px',
                  borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                }}
              >
                <span
                  style={{
                    width: 34, height: 34, borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: `color-mix(in srgb, var(--c-${a.tone === 'info' ? 'ok' : a.tone === 'warn' ? 'warn' : 'danger'}) 13%, transparent)`,
                    color: a.tone === 'info' ? 'var(--adm-info, #7dd3fc)' : a.tone === 'warn' ? 'var(--c-warn)' : 'var(--c-danger)',
                  }}
                >
                  <Icon name={a.icon} size={17} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* En dos renglones si hace falta: cortado a «Azúcar Negra
                      tiene pagos …» no se sabía qué pasaba (SUP-10). */}
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)', lineHeight: 1.3 }}>{a.title}</div>
                  <div className="t-mute" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>
                </div>
                <Button variant="outline" size="sm" render={<Link href={a.href} />}>{a.cta}</Button>
              </div>
            ))}
            {alerts.length > 6 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--adm-border, var(--u-hair))', textAlign: 'center' }}>
                <Link href="/super/finanzas" style={{ fontSize: 12.5, color: 'var(--brand-accent-ink)', textDecoration: 'none', fontWeight: 600 }}>
                  Ver {alerts.length - 6} más en Finanzas →
                </Link>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* Actividad + listas. Columnas de 420 px mínimo: con 300 cabían tres y
          las dos listas dejaban el último tercio vacío (SUP-05). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 14, alignItems: 'start' }}>
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <CardTitle>Actividad de la plataforma · 30 días</CardTitle>
            <CardDescription>Visitas a los menús y pedidos de todos los restaurantes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart series={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: 6 }}>
            <CardTitle>Recién llegados</CardTitle>
            <CardDescription>Los últimos restaurantes creados.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.length === 0 ? (
              <EmptyState icon="utensils" title="Aún no hay restaurantes" action={
                <Button size="sm" render={<Link href="/super/restaurantes/new" />}>Crear el primero</Button>
              } />
            ) : recent.map((r, i) => (
              <Link
                key={r.id}
                href={`/super/restaurantes/${r.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px', textDecoration: 'none',
                  borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-full)', flexShrink: 0, background: r.restaurant_themes[0]?.color_primary ?? 'var(--brand-accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
                    {r.slug} · {new Date(r.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
                <StatusChip status={r.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: 6 }}>
            <CardTitle>Más activos · 30 días</CardTitle>
            <CardDescription>Los que más pedidos generan — tus mejores clientes.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column' }}>
            {top.every((r) => r.orders30 === 0 && r.visits30 === 0) ? (
              <div className="t-mute" style={{ fontSize: 13, padding: '14px 2px' }}>Sin actividad registrada todavía.</div>
            ) : top.map((r, i) => (
              <Link
                key={r.restaurantId}
                href={`/super/metricas/${r.restaurantId}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px', textDecoration: 'none',
                  borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                }}
              >
                <span
                  style={{
                    width: 22, height: 22, borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 800, fontFamily: 'var(--ui-font-mono)',
                    background: i === 0 ? 'color-mix(in srgb, var(--brand-accent) 16%, transparent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                    color: i === 0 ? 'var(--brand-accent)' : 'var(--u-text-3)',
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
                    {r.orders30} pedidos · {r.visits30} visitas · vendió {fmtMoney(r.salesRevenue30, r.config?.currency ?? stats.currency)}
                  </div>
                </div>
                <PlanChip plan={r.plan} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Distribución por plan */}
      <Card>
        <CardHeader style={{ paddingBottom: 8 }}>
          <CardTitle>Distribución por plan</CardTitle>
        </CardHeader>
        <CardContent style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(metrics.byPlan).length === 0 ? (
            <span className="t-mute" style={{ fontSize: 13 }}>Sin restaurantes todavía.</span>
          ) : (
            Object.entries(metrics.byPlan)
              .sort(([, a], [, b]) => b - a)
              .map(([plan, count]) => (
                <Badge
                  key={plan}
                  variant="neutral"
                  style={{ fontSize: 12.5, padding: '7px 12px', gap: 7 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: PLAN_DOT[plan] ?? '#94a3b8' }} />
                  {planLabel(plan)}
                  <strong style={{ fontFamily: 'var(--ui-font-mono)' }}>{count}</strong>
                </Badge>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SectionTitle({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
      <Icon name={icon} size={16} style={{ color: 'var(--brand-accent-ink)' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)', margin: 0 }}>{title}</h2>
      {count != null && count > 0 && (
        <Badge variant="danger" style={{ fontSize: 11 }}>{count}</Badge>
      )}
    </div>
  );
}
