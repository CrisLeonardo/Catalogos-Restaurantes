import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getVisitStats } from '@/lib/actions/metrics';
import { formatPrice, type ResolvedTheme } from '@/lib/theme/resolve';
import { Card } from '@/components/ui/card';
import { List, ListRow, ListText } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { fmtMoney } from '@/lib/money';

export const metadata = { title: 'Negocio – Panel admin' };

/* ============================================================
   /admin/metricas — "Resumen" de Negocio
   ------------------------------------------------------------
   Esta pantalla se llamaba Métricas y enseñaba SOLO visitas web.
   Como primera pestaña de Negocio eso no funcionaba: la pestaña
   se llama "Resumen" y el dueño que la abre quiere saber cómo va
   el negocio —cuánto vendió, cuántos pedidos, qué se vende— no
   cuánta gente abrió la página.

   Así que resume de verdad, en el orden en que se pregunta:
     1. Los números de hoy (dinero primero, tráfico al final).
     2. Cómo vienen las ventas de los últimos 14 días.
     3. Qué se está vendiendo.
     4. Y las visitas, que siguen valiendo, como último bloque.

   Lo hondo sigue viviendo donde vivía: la operación en Analítica
   y el dinero fino en Finanzas. Esto es la portada, no el informe.
   ============================================================ */

export default async function AdminNegocioPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;
  let resolved: ResolvedTheme | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
      timezone = tenantData?.restaurant.timezone ?? timezone;
      ordersEnabled = (tenantData?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
      resolved = tenantData?.resolved ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) resolved = (await getRestaurantBySlug(slug))?.resolved ?? null;
  }

  if (!restaurantId) redirect('/admin/login');

  const [visits, orderStats] = await Promise.all([
    getVisitStats(restaurantId, timezone),
    ordersEnabled ? getOrderStats(restaurantId, timezone) : Promise.resolve(null),
  ]);

  const money = (n: number) => (resolved ? formatPrice(n, resolved.config) : fmtMoney(n));
  const maxVisits = Math.max(...visits.series14.map((d) => d.visits), 1);
  const maxSales = Math.max(...(orderStats?.series.map((d) => d.total) ?? [0]), 1);
  const soldTop = orderStats?.topToday ?? [];

  return (
    <div className="anim-fade-up flex max-w-[1040px] flex-col gap-6">

      {/* 1 · Los números de hoy. El dinero va primero porque es la pregunta
             que trae al dueño a esta pantalla; el tráfico cierra la fila. */}
      <Section
        title="Hoy"
        action={ordersEnabled ? { href: '/admin/finanzas', label: 'Ver el detalle en Finanzas' } : undefined}
      >
        <StatGroup>
          {orderStats && <Stat label="Ventas" value={money(orderStats.todaySales)} />}
          {orderStats && <Stat label="Pedidos" value={String(orderStats.todayOrders)} />}
          {orderStats && <Stat label="Ticket promedio" value={money(orderStats.todayTicket)} />}
          <Stat label={`Visitas (${visits.uniqueToday} únicos)`} value={String(visits.today)} />
        </StatGroup>
      </Section>

      {/* 2 · Ventas por día. Solo si vende en línea: sin pedidos esta gráfica
             sería una fila de ceros presumiendo de informe. */}
      {orderStats && (
        <Section title="Ventas por día · últimos 14 días">
          <Card className="flex flex-col gap-4 p-5">
            <div className="t-mono text-[26px] leading-none font-semibold text-adm-text">
              {money(orderStats.totalLast14)}
            </div>
            <div className="flex h-28 items-end gap-1.5">
              {orderStats.series.map((day, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max((day.total / maxSales) * 100, day.total > 0 ? 6 : 2)}%`,
                      minHeight: 2,
                      background: day.isToday
                        ? 'var(--adm-accent-500)'
                        : 'color-mix(in srgb, var(--u-text) 18%, transparent)',
                      transition: 'height 400ms var(--ease-entry)',
                    }}
                    title={`${day.label}: ${money(day.total)}`}
                  />
                  <span
                    className="t-mono text-[9px]"
                    style={{ color: day.isToday ? 'var(--u-text)' : 'var(--u-text-4)' }}
                  >
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}

      {/* 3 · Qué se vende. La lista completa y el "no se mueve" viven en
             Analítica; aquí van los cinco de hoy. */}
      {orderStats && soldTop.length > 0 && (
        <Section title="Lo más vendido hoy" action={{ href: '/admin/analitica', label: 'Ver todo' }}>
          <List>
            {soldTop.slice(0, 5).map((p) => (
              <ListRow key={p.name}>
                <ListText title={p.name} />
                <span className="t-mono shrink-0 text-[14.5px] text-adm-text">
                  {p.qty} {p.qty === 1 ? 'unidad' : 'unidades'}
                </span>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      {/* 4 · Visitas. Sigue siendo el dato que dice si el menú se está
             viendo, pero no es lo primero que se pregunta. */}
      <Section title="Visitas · últimos 14 días">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-baseline gap-3">
            <span className="t-mono text-[26px] leading-none font-semibold text-adm-text">
              {visits.series14.reduce((s, d) => s + d.visits, 0)}
            </span>
            <span className="text-[13px] text-adm-text-3">
              {visits.unique30} personas distintas en 30 días
            </span>
          </div>
          <div className="flex h-24 items-end gap-1.5">
            {visits.series14.map((day, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-[4px]"
                  style={{
                    height: `${Math.max((day.visits / maxVisits) * 100, day.visits > 0 ? 6 : 2)}%`,
                    minHeight: 2,
                    background: day.isToday
                      ? 'var(--u-text)'
                      : 'color-mix(in srgb, var(--u-text) 14%, transparent)',
                    transition: 'height 400ms var(--ease-entry)',
                  }}
                  title={`${day.label}: ${day.visits} visitas`}
                />
                <span
                  className="t-mono text-[9px]"
                  style={{ color: day.isToday ? 'var(--u-text)' : 'var(--u-text-4)' }}
                >
                  {day.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[12.5px] leading-snug text-adm-text-4">
            Cada apertura de tu menú por un dispositivo cuenta una vez por sesión.
          </p>
        </Card>
      </Section>

      {visits.last30 === 0 && !orderStats && (
        <EmptyState
          icon="chart"
          title="Todavía no hay movimiento que resumir"
          desc="En cuanto alguien abra tu menú o entre el primer pedido, este resumen se llena solo. Comparte tu código QR para empezar."
          action={{ href: '/admin/qr', label: 'Ver mi código QR' }}
        />
      )}
    </div>
  );
}
