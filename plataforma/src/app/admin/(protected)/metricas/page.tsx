import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getSalesReport, type DayRevenue } from '@/lib/db/reports';
import { getVisitStats, type DayVisits } from '@/lib/actions/metrics';
import { countVisitsInRange } from '@/lib/db/visits';
import { formatPrice, type ResolvedTheme } from '@/lib/theme/resolve';
import { Card } from '@/components/ui/card';
import { List, ListRow, ListText } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartReadout } from '@/components/ui/chart-readout';
import Link from '@/components/admin/panel-link';
import { fmtMoney } from '@/lib/money';
import { diaSemana } from '@/lib/dates';
import { localDateKey } from '@/lib/hours';
import { PERIODOS, esPeriodo, rangoDePeriodo, comparacion, serieCompleta, type Periodo } from '@/lib/periodo';

export const metadata = { title: 'Negocio – Panel admin' };

/* ============================================================
   /admin/metricas — «Resumen» de Negocio
   ------------------------------------------------------------
   Contesta «¿cómo va el negocio?» con la SEMANA o el MES contra el
   periodo anterior (auditoría 2026-10-02, D-3). Antes enseñaba las
   cifras de hoy y la gráfica de 14 días: lo mismo que Hoy y Pedidos,
   en tres pantallas seguidas. Ahora:

     · Hoy               — el pulso del día.
     · Pedidos › En vivo — la operación, sin gráficas.
     · Resumen           — 7 o 30 días, con «↑ 12 % vs. los 7 días
                           anteriores» bajo cada cifra.

   Lo hondo sigue donde vivía: el dinero fino en Finanzas, la
   operación en Analítica.
   ============================================================ */

export default async function AdminNegocioPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
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

  const sp = await searchParams;
  const periodo: Periodo = esPeriodo(sp.periodo) ? sp.periodo : 'semana';
  const dias = PERIODOS[periodo];
  const hoy = localDateKey(new Date(), timezone);
  const { from, to, prevFrom, prevTo } = rangoDePeriodo(hoy, dias);

  const [actual, anterior, visitas, visitasAntes, visits] = await Promise.all([
    ordersEnabled ? getSalesReport(restaurantId, from, to, timezone) : Promise.resolve(null),
    ordersEnabled ? getSalesReport(restaurantId, prevFrom, prevTo, timezone) : Promise.resolve(null),
    countVisitsInRange(restaurantId, from, to, timezone),
    countVisitsInRange(restaurantId, prevFrom, prevTo, timezone),
    getVisitStats(restaurantId, timezone),
  ]);

  const money = (n: number) => (resolved ? formatPrice(n, resolved.config) : fmtMoney(n));
  const vs = (a: number, b: number) => comparacion(a, b, dias)?.texto;

  const serie = actual
    ? serieCompleta<DayRevenue>(actual.series, from, dias, (date) => ({ date, label: '', revenue: 0, orders: 0 }))
    : [];
  const maxSales = Math.max(...serie.map((d) => d.revenue), 1);
  const maxVisits = Math.max(...visits.series14.map((d) => d.visits), 1);
  const top = actual?.topByRevenue.slice(0, 5) ?? [];

  // Lo que dice cada barra al tocarla (NEG-05).
  const dia = (date: string) => (date === hoy ? 'hoy' : diaSemana(date));
  const salesTip = (d?: DayRevenue) => (d
    ? `${dia(d.date)} · ${money(d.revenue)} · ${d.orders} ${d.orders === 1 ? 'pedido' : 'pedidos'}`
    : undefined);
  const visitsTip = (d?: DayVisits) => (d ? `${d.isToday ? 'hoy' : diaSemana(d.date)} · ${d.visits} ${d.visits === 1 ? 'visita' : 'visitas'}` : undefined);

  const nada = visitas === 0 && visitasAntes === 0 && (!actual || actual.orders === 0);

  return (
    <div className="anim-fade-up adm-w-overview flex flex-col gap-6">

      {/* El periodo: dos enlaces (la página se pinta en el servidor con el
          rango elegido; `?periodo=` se puede compartir y sobrevive a recargar). */}
      <nav className="admin-tabs adm-tabs-page" aria-label="Periodo">
        {(['semana', 'mes'] as const).map((p) => (
          <Link
            key={p}
            href={p === 'semana' ? '/admin/metricas' : '/admin/metricas?periodo=mes'}
            className="admin-tab press"
            data-active={periodo === p ? '1' : '0'}
            aria-current={periodo === p ? 'page' : undefined}
          >
            {p === 'semana' ? 'Últimos 7 días' : 'Últimos 30 días'}
          </Link>
        ))}
      </nav>

      {/* 1 · Las cifras del periodo, cada una con su comparación. */}
      <Section
        title={periodo === 'semana' ? 'Esta semana' : 'Este mes'}
        action={ordersEnabled ? { href: '/admin/finanzas', label: 'Ver el detalle en Finanzas' } : undefined}
      >
        <StatGroup>
          {actual && anterior && (
            <Stat label="Ventas" value={money(actual.revenue)} sub={vs(actual.revenue, anterior.revenue)} />
          )}
          {actual && anterior && (
            <Stat label="Pedidos" value={String(actual.orders)} sub={vs(actual.orders, anterior.orders)} />
          )}
          {actual && anterior && (
            <Stat label="Ticket promedio" value={money(actual.avgTicket)} sub={vs(actual.avgTicket, anterior.avgTicket)} />
          )}
          <Stat label="Visitas al menú" value={String(visitas)} sub={vs(visitas, visitasAntes)} />
        </StatGroup>
      </Section>

      {/* 2 · Ventas por día del periodo. Solo si vende en línea: sin pedidos
             esta gráfica sería una fila de ceros presumiendo de informe. */}
      {actual && (
        <Section title={`Ventas por día · últimos ${dias} días`}>
          <Card className="flex flex-col gap-4 p-5">
            <div className="t-mono text-[26px] leading-none font-semibold text-adm-text">
              {money(actual.revenue)}
            </div>
            <ChartReadout defaultTip={salesTip(serie[serie.length - 1])}>
              <div className="flex h-28" style={{ gap: dias > 7 ? 3 : 6 }}>
                {serie.map((d) => (
                  <div key={d.date} data-tip={salesTip(d)} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <div className="flex min-h-0 w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-[4px]"
                        style={{
                          height: `${Math.max((d.revenue / maxSales) * 100, d.revenue > 0 ? 6 : 2)}%`,
                          minHeight: 2,
                          background: d.date === hoy ? 'var(--chart-hi)' : 'var(--chart-base)',
                          transition: 'height 400ms var(--ease-entry)',
                        }}
                      />
                    </div>
                    {/* Con 30 barras no caben 30 rótulos: solo en la semana. */}
                    {dias <= 7 && (
                      <span
                        className="t-mono text-[11px]"
                        style={{ color: d.date === hoy ? 'var(--u-text)' : 'var(--u-text-4)' }}
                      >
                        {diaSemana(d.date).slice(0, 3)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {dias > 7 && (
                <div className="mt-1.5 flex justify-between text-[11px] text-adm-text-4">
                  <span>hace {dias} días</span>
                  <span>hoy</span>
                </div>
              )}
            </ChartReadout>
          </Card>
        </Section>
      )}

      {/* 3 · Qué se vende en el periodo. La lista completa vive en Analítica. */}
      {top.length > 0 && (
        <Section title={`Lo más vendido · últimos ${dias} días`} action={{ href: '/admin/analitica', label: 'Ver todo' }}>
          <List>
            {top.map((p) => (
              <ListRow key={p.name}>
                <ListText title={p.name} />
                <span className="t-mono shrink-0 text-[14px] text-adm-text-3">
                  {p.qty} {p.qty === 1 ? 'unidad' : 'unidades'}
                </span>
                <span className="t-mono w-28 shrink-0 text-right text-[14.5px] text-adm-text">{money(p.revenue)}</span>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      {/* 4 · Visitas, día por día. */}
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
          <ChartReadout defaultTip={visitsTip(visits.series14.find((d) => d.isToday))}>
          <div className="flex h-24 gap-1.5">
            {visits.series14.map((day, i) => (
              <div key={i} data-tip={visitsTip(day)} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex min-h-0 w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max((day.visits / maxVisits) * 100, day.visits > 0 ? 6 : 2)}%`,
                      minHeight: 2,
                      background: day.isToday ? 'var(--chart-hi)' : 'var(--chart-base)',
                      transition: 'height 400ms var(--ease-entry)',
                    }}
                  />
                </div>
                <span
                  className="t-mono text-[11px]"
                  style={{ color: day.isToday ? 'var(--u-text)' : 'var(--u-text-4)' }}
                >
                  {day.label}
                </span>
              </div>
            ))}
          </div>
          </ChartReadout>
          <p className="text-[12.5px] leading-snug text-adm-text-4">
            Cada apertura de tu menú por un dispositivo cuenta una vez por sesión.
          </p>
        </Card>
      </Section>

      {nada && (
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
