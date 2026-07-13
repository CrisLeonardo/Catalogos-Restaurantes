import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getVisitStats } from '@/lib/actions/metrics';
import { Card } from '@/components/ui/card';

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

      {/* KPIs de visitas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12 }}>
        <Kpi label="Visitas hoy" value={String(visits.today)} sub={`${visits.uniqueToday} visitantes únicos`} hero />
        <Kpi label="Últimos 7 días" value={String(visits.last7)} sub={`${visits.unique7} únicos`} />
        <Kpi label="Últimos 30 días" value={String(visits.last30)} sub={`${visits.unique30} únicos`} />
        {orderStats && (
          <Kpi
            label="Conversión hoy"
            value={conversion === null ? '–' : `${conversion.toFixed(0)}%`}
            sub={`${orderStats.todayOrders} pedidos / ${visits.today} visitas`}
          />
        )}
      </div>

      {/* Gráfica 14 días */}
      <Card className="flex flex-col gap-3.5 p-4.5">
        <div>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Visitas · 14 días</div>
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
        <Card className="p-3.5" style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Aún no hay visitas registradas. El contador empieza a funcionar desde que
          se activó esta función; comparte tu QR o tu enlace para ver movimiento aquí.
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <Card className="flex flex-col gap-2 p-4.5">
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </Card>
  );
}
