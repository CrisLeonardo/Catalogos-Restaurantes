import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { PageHeader, StatCard, PlanChip, StatusChip, ActivityChart, PLAN_DOT } from '@/components/super/ui';
import { Badge } from '@/components/ui/badge';
import { getGlobalMetrics, getAllRestaurants, getAllRestaurantsTraffic, getPlatformDailySeries } from '@/lib/db/super-admin';
import { planLabel } from '@/lib/db/billing';
import { PLAN_ORDER } from '@/lib/plans';

export const metadata = { title: 'Métricas — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function MetricasPage() {
  const [metrics, restaurants, traffic, series] = await Promise.all([
    getGlobalMetrics(),
    getAllRestaurants(),
    getAllRestaurantsTraffic(),
    getPlatformDailySeries(),
  ]);

  const totalVisits30 = [...traffic.values()].reduce((s, t) => s + t.visits30, 0);
  const totalUnique30 = [...traffic.values()].reduce((s, t) => s + t.unique30, 0);
  const totalOrders30 = [...traffic.values()].reduce((s, t) => s + t.orders30, 0);
  // Solo pedidos del comensal desde el menú: los del mesero o la caja no
  // salen de una visita y empujaban esto por encima del 100 % (SUP-04).
  const totalOnline30 = [...traffic.values()].reduce((s, t) => s + t.online30, 0);
  const conversion = totalVisits30 > 0 ? Math.min(100, (totalOnline30 / totalVisits30) * 100) : 0;

  // Tabla ordenada por actividad (los que más visitas generan primero).
  const sorted = [...restaurants].sort(
    (a, b) => (traffic.get(b.id)?.visits30 ?? 0) - (traffic.get(a.id)?.visits30 ?? 0),
  );

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        subtitle="Actividad global de los últimos 30 días. Entra a un restaurante para ver su detalle, crecimiento y evaluación de cobro."
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard label="Restaurantes" value={metrics.total} icon="utensils" sub={`${metrics.active} activos${metrics.suspended > 0 ? ` · ${metrics.suspended} susp.` : ''}`} />
        <StatCard label="Visitas 30 días" value={totalVisits30.toLocaleString('es-GT')} icon="eye" />
        <StatCard label="Visitantes únicos" value={totalUnique30.toLocaleString('es-GT')} icon="users" />
        <StatCard label="Pedidos 30 días" value={totalOrders30.toLocaleString('es-GT')} icon="bag" tone="ok" />
        <StatCard label="Conversión" value={`${conversion.toFixed(1)}%`} icon="chart" sub="pedidos en línea / visitas" />
      </div>

      {/* Gráfica global */}
      <Card>
        <CardHeader style={{ paddingBottom: 8 }}>
          <CardTitle>Actividad diaria · 30 días</CardTitle>
          <CardDescription>Todos los restaurantes juntos: visitas a menús y pedidos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart series={series} />
        </CardContent>
      </Card>

      {/* Distribución por plan */}
      <Card>
        <CardHeader style={{ paddingBottom: 8 }}>
          <CardTitle>Restaurantes por plan</CardTitle>
        </CardHeader>
        <CardContent style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PLAN_ORDER.filter((p) => (metrics.byPlan[p] ?? 0) > 0).map((p) => (
            <Badge key={p} variant="neutral" style={{ fontSize: 12, padding: '7px 12px', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: PLAN_DOT[p] }} />
              {planLabel(p)} <strong style={{ fontFamily: 'var(--ui-font-mono)' }}>{metrics.byPlan[p]}</strong>
            </Badge>
          ))}
          {Object.keys(metrics.byPlan).length === 0 && (
            <span className="t-mute" style={{ fontSize: 13 }}>Sin restaurantes todavía.</span>
          )}
        </CardContent>
      </Card>

      {/* Tabla completa */}
      {restaurants.length > 0 && (
        <section>
          <h2 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: 'var(--u-text)' }}>
            Todos los restaurantes
          </h2>
          <Table data-stack="">
            <TableHeader>
              <TableRow style={{ borderTop: 'none' }}>
                <TableHead>Restaurante</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Visitas 30d</TableHead>
                <TableHead className="text-right">Únicos</TableHead>
                <TableHead className="text-right">Pedidos 30d</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const t = traffic.get(r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/super/metricas/${r.id}`} style={{ color: 'var(--u-text)', textDecoration: 'none', fontWeight: 600 }}>
                        {r.name}
                      </Link>
                      <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)', marginTop: 2 }}>{r.slug}</div>
                    </TableCell>
                    <TableCell data-label="Plan"><PlanChip plan={r.plan_actual} /></TableCell>
                    <TableCell data-label="Estado"><StatusChip status={r.status} /></TableCell>
                    <TableCell data-label="Visitas 30d" className="text-right" style={{ fontFamily: 'var(--ui-font-mono)' }}>{t?.visits30 ?? 0}</TableCell>
                    <TableCell data-label="Únicos" className="text-right" style={{ fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{t?.unique30 ?? 0}</TableCell>
                    <TableCell data-label="Pedidos 30d" className="text-right" style={{ fontFamily: 'var(--ui-font-mono)' }}>{t?.orders30 ?? 0}</TableCell>
                    <TableCell data-label="Alta" style={{ color: 'var(--u-text-4)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right" style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/super/metricas/${r.id}`} style={{ fontSize: 12, color: 'var(--brand-accent-ink)', textDecoration: 'none', fontWeight: 600 }}>
                        Detalle →
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
