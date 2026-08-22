import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getVisitStats } from '@/lib/actions/metrics';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Métricas – Panel admin' };

/* ============================================================
   /admin/metricas — tráfico y conversión del restaurante
   ------------------------------------------------------------
   Cuántas personas visitan la web, cuántas son nuevas/únicas y
   cuántas terminan pidiendo: el dato que le dice al dueño si el
   servicio le es rentable.
   ============================================================ */

export default async function AdminMetricasPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
      timezone = tenantData?.restaurant.timezone ?? timezone;
      ordersEnabled = (tenantData?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  const [visits, orderStats] = await Promise.all([
    getVisitStats(restaurantId, timezone),
    ordersEnabled ? getOrderStats(restaurantId, timezone) : Promise.resolve(null),
  ]);

  const conversion =
    orderStats && visits.today > 0
      ? Math.min(100, (orderStats.todayOrders / visits.today) * 100)
      : null;
  const maxVisits = Math.max(...visits.series14.map((d) => d.visits), 1);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0 }}>
        Visitas a tu sitio (cada apertura de la app por un dispositivo cuenta una vez por sesión).
      </p>

      <Section title="Visitas">
        <StatGroup>
          <Stat label={`Hoy (${visits.uniqueToday} únicos)`} value={String(visits.today)} />
          <Stat label={`7 días (${visits.unique7} únicos)`} value={String(visits.last7)} />
          <Stat label={`30 días (${visits.unique30} únicos)`} value={String(visits.last30)} />
          {orderStats && (
            <Stat
              label={`Conversión hoy (${orderStats.todayOrders}/${visits.today})`}
              value={conversion === null ? '–' : `${conversion.toFixed(0)}%`}
            />
          )}
        </StatGroup>
      </Section>

      {/* Gráfica 14 días */}
      <Card className="flex flex-col gap-3.5 p-4.5">
        <div>
          <div className="t-kicker">Visitas · 14 días</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4, lineHeight: 1 }}>
            {visits.series14.reduce((s, d) => s + d.visits, 0)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
          {visits.series14.map((day, i) => {
            const h = (day.visits / maxVisits) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div
                  style={{
                    width: '100%',
                    height: `${Math.max(h, day.visits > 0 ? 6 : 2)}%`,
                    minHeight: 2,
                    borderRadius: '4px 4px 0 0',
                    background: day.isToday ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 14%, transparent)',
                    transition: 'height 400ms var(--ease-entry)',
                  }}
                  title={`${day.label}: ${day.visits} visitas`}
                />
                <span
                  className="t-mono"
                  style={{ fontSize: 8.5, color: day.isToday ? 'var(--u-text)' : 'var(--u-text-4)', fontWeight: day.isToday ? 700 : 500 }}
                >
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {visits.last30 === 0 && (
        <EmptyState
          icon="chart"
          title="Aún no hay visitas registradas"
          desc="El contador empieza a funcionar desde que se activó esta función; comparte tu QR o tu enlace para ver movimiento aquí."
          action={{ href: '/admin/qr', label: 'Ver mi código QR' }}
        />
      )}
    </div>
  );
}
