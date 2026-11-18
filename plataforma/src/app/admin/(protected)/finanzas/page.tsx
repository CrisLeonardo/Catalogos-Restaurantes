import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getSalesReport } from '@/lib/db/reports';
import { can } from '@/lib/permissions';
import SelectorPeriodo from '@/components/admin/selector-periodo';
import { rangoEnPalabras } from '@/lib/rango-en-palabras';
import ExportReportButton from '@/components/admin/export-report-button';
import AvisoLectura from '@/components/admin/aviso-lectura';
import { DeDondeVino, LoMasVendido } from '@/components/admin/finanzas-tarjetas';
import { ChartReadout } from '@/components/ui/chart-readout';
import { fmtMoney } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import { panelLink } from '@/lib/panel-links-server';
import { diaDeNegocio } from '@/lib/caja/dia';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import s from '@/components/admin/negocio.module.css';

export const metadata = { title: 'Finanzas – Panel admin' };

/* ============================================================
   /admin/finanzas — el reporte del negocio
   ------------------------------------------------------------
   Ingreso, ganancia, margen y mix de ventas en un rango. El arqueo
   de caja vive en su propia pestaña (Caja) desde 2026-09-01.

   Línea N «nada saturado» (maqueta aprobada el 2026-11-18,
   docs/diseno/MAQUETA_ANALITICA_FINANZAS_NADA_SATURADO_2026-11-18.html):
   - la respuesta arriba: «Vendiste Q…» con su gráfica por día, que
     se lee al tocar una barra (antes las barras quedaban aplastadas
     en 2 px y no se veía nada);
   - un selector de periodo de una línea; Excel y PDF en «Descargar»;
   - nada en Q0.00: sin costos se dice cómo ver la ganancia y con
     costos a medias, «estimación parcial» y cuánto cubre (O06, PA-T17);
     con la lectura caída sale el aviso, no ceros (X20);
   - canal, pago y zona en una tarjeta; zona se mide contra lo vendido
     a domicilio, no contra todo.
   ============================================================ */

const money = (n: number) => fmtMoney(n);
const pedidos = (n: number) => (n === 1 ? '1 pedido' : `${n.toLocaleString('es-GT')} pedidos`);
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
/** «Vie 14 nov» */
function diaLargo(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}
/** «14 nov» */
function diaCorto(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/* «Hoy» es el día de NEGOCIO (migración 145): a la 1:30 el rango por
   omisión sigue siendo el de la noche que todavía no termina. */
async function todayInTz(tz: string, restaurantId: string): Promise<string> {
  return diaDeNegocio(new Date(), tz, await corteDelRestaurante(restaurantId));
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function AdminFinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'finanzas')) redirect(await panelLink('/admin'));

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
      timezone = t?.restaurant.timezone ?? timezone;
      ordersEnabled = (t?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  if (!ordersEnabled) {
    return (
      <EmptyState
        icon="banknote"
        title="Finanzas todavía no está activa"
        desc="Los reportes financieros y el corte de caja se basan en los pedidos en línea. Enciende la función Pedidos (plan Estándar) para empezar a medir ingresos, utilidad y margen."
        action={{ href: '/admin/suscripcion', label: 'Ver planes' }}
      />
    );
  }

  const hoy = await todayInTz(timezone, restaurantId);
  const sp = await searchParams;
  const to = isYmd(sp.to) && sp.to <= hoy ? sp.to : hoy;
  const from = isYmd(sp.from) && sp.from <= to ? sp.from : shiftYmd(to, -29);

  const [report, costosHref] = await Promise.all([
    getSalesReport(restaurantId, from, to, timezone),
    panelLink('/admin/menu'),
  ]);
  const rango = rangoEnPalabras(from, to, hoy);

  const selector = (
    <SelectorPeriodo from={from} to={to} hoy={hoy} basePath="/admin/finanzas">
      {report.estado !== 'error' && report.orders > 0 && (
        <ExportReportButton
          restaurantId={restaurantId}
          from={from}
          to={to}
          resumen={`${rango.charAt(0).toUpperCase()}${rango.slice(1)} · ${pedidos(report.orders)}`}
        />
      )}
    </SelectorPeriodo>
  );

  /* Con la lectura caída, los ceros dirían «no vendiste»: no se pintan
     (auditoría 2026-11-03, X20/PA-T16). */
  if (report.estado === 'error') {
    return (
      <div className={`${s.panel} anim-fade-up`}>
        {selector}
        <AvisoLectura estado="error" que="las ventas de estas fechas" noConcluir="No significa que no hayas vendido." sinDatos />
      </div>
    );
  }

  if (report.orders === 0) {
    return (
      <div className={`${s.panel} anim-fade-up`}>
        {selector}
        <div className={`${s.tarjeta} ${s.vendido}`}>
          <p className={s.clave}>Sin ventas {rango}</p>
          <p className={s.apoyo}>Elige otras fechas para ver lo que vendiste.</p>
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...report.series.map((d) => d.revenue), 1);
  const tip = (d: { date: string; revenue: number; orders: number }) =>
    `${diaLargo(d.date)} · ${money(d.revenue)} · ${pedidos(d.orders)}`;
  const ultimoConVenta = [...report.series].reverse().find((d) => d.revenue > 0);
  const primero = report.series[0];
  const ultimo = report.series.at(-1);

  /* La ganancia de los platillos: sin costos no existe (no «Q0.00»); con
     costos a medias es una estimación y se dice cuánto cubre. Costear
     variantes, extras y empaque (F16/O06) queda para la ficha 3.2. */
  const sinCostos = report.marginPct == null;
  const cobertura = report.productRevenue > 0 ? report.costedRevenue / report.productRevenue : 0;
  const parcial = !sinCostos && cobertura < 0.95;

  const domicilio = report.byChannel.find((c) => c.key === 'DELIVERY')?.revenue ?? 0;

  return (
    <div className={`${s.panel} anim-fade-up`}>
      {selector}

      {/* Un solo orden en el DOM: el del teléfono (vendido, ganancia, la
          línea, de dónde vino, platillos). En la PC la rejilla los pone
          en dos columnas. */}
      <div className={s.finanzas}>
        <div className={s.aVendido}>
            <section className={`${s.tarjeta} ${s.vendido}`} aria-labelledby="lo-vendido">
              <h2 className={s.clave} id="lo-vendido">Vendiste {rango}</h2>
              <p className={s.cifra}>{money(report.revenue)}</p>
              <p className={s.apoyo}>{pedidos(report.orders)} · ticket promedio {money(report.avgTicket)}</p>
              {report.series.length > 1 && (
                <ChartReadout className={s.lectura} defaultTip={ultimoConVenta ? tip(ultimoConVenta) : undefined}>
                  <div className={s.barras} role="img" aria-label={`Lo vendido por día ${rango}. Toca una barra para ver ese día.`}>
                    {report.series.map((d) => (
                      <div key={d.date} className={s.columna} data-tip={tip(d)}>
                        <span
                          className={s.barra}
                          data-vacia={d.revenue > 0 ? undefined : ''}
                          style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className={s.eje} aria-hidden>
                    <span>{primero ? diaCorto(primero.date) : ''}</span>
                    <span>{ultimo ? diaCorto(ultimo.date) : ''}</span>
                  </div>
                </ChartReadout>
              )}
            </section>
        </div>
        <div className={s.aGanancia}>
            <div className={`${s.tarjeta} ${s.ganancia}`}>
              {sinCostos ? (
                <>
                  <div>¿Cuánto ganaste?<span>Pon el costo de tus platillos y aquí verás la ganancia.</span></div>
                  <Link className={s.enlace} href={costosHref}>Poner costos</Link>
                </>
              ) : parcial ? (
                <div>
                  Ganaste unos
                  <b className={s.monto}>{money(report.profit)}</b>
                  <span>
                    Solo cuenta {money(report.costedRevenue)} de lo vendido ({Math.round(cobertura * 100)} %): el resto de tus platillos no tiene costo.
                  </span>
                  <span className={s.parcial}>Estimación parcial</span>
                </div>
              ) : (
                <div>
                  Ganaste
                  <b className={s.monto}>{money(report.profit)}</b>
                  <span>Margen {(report.marginPct ?? 0).toFixed(0)} % · costo de lo vendido {money(report.cost)} · antes de sueldos y gastos</span>
                </div>
              )}
            </div>
        </div>
        <div className={s.aLinea}>
            {(report.deliveryRevenue > 0 || report.tips > 0) && (
              <p className={s.linea}>
                Incluye{' '}
                {report.deliveryRevenue > 0 && <><b>{money(report.deliveryRevenue)}</b> de envíos</>}
                {report.deliveryRevenue > 0 && report.tips > 0 && ' y '}
                {report.tips > 0 && <><b>{money(report.tips)}</b> de propinas</>}.
              </p>
            )}

            {/* La venta no se borra al devolver (migración 145): el dinero que
                salió se cuenta aparte, el día en que salió. */}
            {report.refunds > 0 && (
              <p className={s.linea}>
                Se devolvieron <b>{money(report.refunds)}</b> en {pedidos(report.refundOrders)}. No se restan de lo vendido: el dinero salió el día de la devolución.
              </p>
            )}
        </div>
        <div className={s.aOrigen}>
            <DeDondeVino
              canal={report.byChannel}
              pago={report.byPayment}
              zona={report.byZone}
              total={report.revenue}
              totalDomicilio={domicilio}
            />
        </div>
        <div className={s.aTop}>
            {report.topByRevenue.length > 0 && (
              <LoMasVendido
                porIngreso={report.topByRevenue.map(({ name, qty, revenue, profit }) => ({ name, qty, revenue, profit }))}
                porGanancia={report.topByProfit.map(({ name, qty, revenue, profit }) => ({ name, qty, revenue, profit }))}
              />
            )}
        </div>
      </div>
    </div>
  );
}
