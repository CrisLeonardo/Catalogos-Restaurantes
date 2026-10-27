import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getSalesReport, type Split } from '@/lib/db/reports';
import { can } from '@/lib/permissions';
import DateRangeForm from '@/components/admin/date-range-form';
import ExportReportButton from '@/components/admin/export-report-button';
import { fmtMoney } from '@/lib/money';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { panelLink } from '@/lib/panel-links-server';
import { diaDeNegocio } from '@/lib/caja/dia';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';

export const metadata = { title: 'Finanzas – Panel admin' };

/* ============================================================
   /admin/finanzas — el reporte del negocio
   ------------------------------------------------------------
   Ingreso, utilidad, margen y mix de ventas en un rango.

   Esta pantalla NO se rediseñó en 2026-09-01: funciona y el dueño
   la conoce. Lo único que cambió es que el arqueo de caja se fue de
   aquí. Vivía al final del scroll, como un formulario largo detrás
   de siete tarjetas de números — y cerrar caja no es un apéndice de
   un reporte: es la última tarea de todas las noches, la hace el
   cajero y no el dueño. Ahora vive en su propia pestaña (Caja) y
   aquí queda el enlace, para que quien lo buscaba donde siempre
   estuvo lo encuentre.
   ============================================================ */

const money = (n: number) => fmtMoney(n);

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
        desc="Los reportes financieros y el corte de caja se basan en los pedidos en línea. Activa el módulo Pedidos (plan Estándar) para empezar a medir ingresos, utilidad y margen."
        action={{ href: '/admin/suscripcion', label: 'Ver planes' }}
      />
    );
  }

  const today = await todayInTz(timezone, restaurantId);
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : today;
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const report = await getSalesReport(restaurantId, from, to, timezone);

  const maxRevenue = Math.max(...report.series.map((d) => d.revenue), 1);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Rango + export */}
      <Card className="flex flex-col gap-3 p-4">
        <DateRangeForm from={from} to={to} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ExportReportButton restaurantId={restaurantId} from={from} to={to} />
        </div>
      </Card>

      <Section title="Resumen del rango">
        <StatGroup>
          <Stat label={`Ingreso (${report.orders} ${report.orders === 1 ? 'pedido' : 'pedidos'})`} value={money(report.revenue)} />
          <Stat label={report.marginPct != null ? `Utilidad (margen ${report.marginPct.toFixed(0)}%)` : 'Utilidad (captura costos)'} value={money(report.profit)} />
          <Stat label="Costo de productos vendidos" value={money(report.cost)} />
          <Stat label="Ticket promedio" value={money(report.avgTicket)} />
          <Stat label="Envíos" value={money(report.deliveryRevenue)} />
          <Stat label={report.tips > 0 ? 'Propinas (incluidas en el ingreso)' : 'Propinas'} value={money(report.tips)} />
        </StatGroup>
      </Section>

      {/* La venta no se borra al devolver (migración 145): el dinero que
          salió se cuenta aparte, el día en que salió. */}
      {report.refunds > 0 && (
        <Card className="p-3.5" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Se devolvieron <strong>{money(report.refunds)}</strong> a clientes en{' '}
          {report.refundOrders === 1 ? 'un pedido' : `${report.refundOrders} pedidos`} durante este rango.
          El ingreso no los resta: la venta sigue registrada y el dinero salió el día de la devolución.
        </Card>
      )}

      {report.marginPct == null && report.orders > 0 && (
        <Card className="p-3.5" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Aún no hay costos capturados en tus productos: la utilidad y el margen aparecerán
          cuando pongas el <strong>Costo</strong> en el editor de cada platillo.
        </Card>
      )}

      {/* Con costos a medias, «Utilidad Q34.50 (margen 48 %)» junto a un
          ingreso de Q2,794 se lee como que el negocio gana Q34. Es la utilidad
          de los platillos que SÍ tienen costo, y hay que decirlo con la cifra
          (auditoría 2026-10-02, NEG-01). */}
      {report.marginPct != null && report.productRevenue > 0 && report.costedRevenue < report.productRevenue * 0.95 && (
        <Card className="p-3.5" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          La utilidad y el margen solo cuentan los platillos que tienen costo cargado:{' '}
          <strong>{money(report.costedRevenue)}</strong> de <strong>{money(report.productRevenue)}</strong> vendidos
          ({Math.round((report.costedRevenue / report.productRevenue) * 100)}%). Pon el <strong>Costo</strong> en
          el resto de tus platillos para ver la utilidad completa.
        </Card>
      )}

      {/* Gráfica diaria */}
      <Card className="flex flex-col gap-3.5 p-4.5">
        <div className="adm-label">Ingreso por día</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {report.series.map((d, i) => {
            const h = (d.revenue / maxRevenue) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <div
                  title={`${d.label}: ${money(d.revenue)} · ${d.orders} ${d.orders === 1 ? 'pedido' : 'pedidos'}`}
                  style={{
                    width: '100%', height: `${Math.max(h, d.revenue > 0 ? 5 : 1.5)}%`, minHeight: 2,
                    borderRadius: '3px 3px 0 0',
                    background: d.revenue > 0 ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--u-text-4)' }}>
          <span>{report.series[0]?.label}</span>
          <span>{report.series[report.series.length - 1]?.label}</span>
        </div>
      </Card>

      {/* Mix de ventas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SplitCard title="Por canal" rows={report.byChannel} total={report.revenue} />
        <SplitCard title="Por método de pago" rows={report.byPayment} total={report.revenue} />
        {report.byZone.length > 0 && <SplitCard title="Por zona de entrega" rows={report.byZone} total={report.revenue} />}
      </div>

      {/* Top productos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <ProductTable title="Más vendidos (por ingreso)" rows={report.topByRevenue.map((p) => ({ name: p.name, a: `${p.qty}`, b: money(p.revenue) }))} colA="Cant." colB="Ingreso" />
        {report.topByProfit.length > 0 && (
          <ProductTable title="Más rentables (por utilidad)" rows={report.topByProfit.map((p) => ({ name: p.name, a: `${p.qty}`, b: money(p.profit) }))} colA="Cant." colB="Utilidad" />
        )}
      </div>

    </div>
  );
}

function SplitCard({ title, rows, total }: { title: string; rows: Split[]; total: number }) {
  return (
    <Card className="flex flex-col gap-3 p-4.5">
      <div className="adm-label">{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r) => {
        const pct = total > 0 ? (r.revenue / total) * 100 : 0;
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--u-text-2)' }}>{r.label}</span>
              <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{money(r.revenue)} · {pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 'var(--radius-full)' }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function ProductTable({ title, rows, colA, colB }: { title: string; rows: { name: string; a: string; b: string }[]; colA: string; colB: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4.5">
      <div className="adm-label">{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 90px', gap: 8, fontSize: 11, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Platillo</span><span style={{ textAlign: 'right' }}>{colA}</span><span style={{ textAlign: 'right' }}>{colB}</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 90px', gap: 8, fontSize: 13, padding: '5px 0', borderTop: i > 0 ? '1px solid var(--u-hair)' : 'none' }}>
              <span style={{ color: 'var(--u-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-3)' }}>{r.a}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text)' }}>{r.b}</span>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
