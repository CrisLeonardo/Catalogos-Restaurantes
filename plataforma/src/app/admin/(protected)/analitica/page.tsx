import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getAnalytics, type CountSplit, type Velocity } from '@/lib/db/analytics';
import { can } from '@/lib/permissions';
import DateRangeForm from '@/components/admin/date-range-form';

export const metadata = { title: 'Analítica – Panel admin' };

/* ============================================================
   /admin/analitica — operación y comportamiento de ventas
   Horas pico, velocidad de productos, cancelación y tiempos.
   (El dinero vive en /admin/finanzas.)
   ============================================================ */

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function todayInTz(tz: string): string {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz }); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmtMin = (m: number | null) => (m == null ? '–' : m >= 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);

export default async function AdminAnaliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'analitica')) redirect('/admin/menu');

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
      <div className="glass" style={{ borderRadius: 16, padding: '24px 22px', maxWidth: 560 }}>
        <div className="t-display" style={{ fontSize: 20, marginBottom: 8 }}>Analítica</div>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
          La analítica de operación se basa en los pedidos en línea. Activa el módulo
          <strong> Pedidos</strong> (plan Premium) para ver horas pico, velocidad de
          productos, cancelaciones y tiempos.
        </p>
      </div>
    );
  }

  const today = todayInTz(timezone);
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : today;
  const from = isYmd(sp.from) ? sp.from : shiftYmd(to, -29);

  const a = await getAnalytics(restaurantId, from, to, timezone);

  // Mapa de calor → lookup rápido por "day-hour".
  const heatLookup = new Map(a.heat.map((c) => [`${c.day}-${c.hour}`, c.count]));

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="glass" style={{ borderRadius: 16, padding: 16 }}>
        <DateRangeForm from={from} to={to} basePath="/admin/analitica" />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Pedidos" value={String(a.validOrders)} sub={`${a.totalOrders} con cancelados`} hero />
        <Kpi label="Cancelación" value={`${a.cancelRate.toFixed(0)}%`} sub={`${a.cancelled} cancelados`} />
        <Kpi label="Prep. promedio" value={fmtMin(a.avgPrepMin)} sub={a.prepSamples > 0 ? `${a.prepSamples} pedidos` : 'sin datos aún'} />
        <Kpi label="Entrega promedio" value={fmtMin(a.avgDeliveryMin)} sub={a.deliverySamples > 0 ? `${a.deliverySamples} domicilios` : 'sin datos aún'} />
        <Kpi label="Franja pico" value={a.peakLabel ?? '–'} sub={a.busiestWeekday ? `día fuerte: ${a.busiestWeekday}` : undefined} small />
      </div>

      {a.avgPrepMin == null && a.validOrders > 0 && (
        <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Los tiempos de preparación y entrega se miden desde que cambias el estado de los
          pedidos (Nuevo → Listo → Entregado). Empezarán a aparecer con los próximos pedidos.
        </div>
      )}

      {/* Mapa de calor de horas pico */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Horas pico · pedidos por día y hora</div>
        {a.heatMax === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin pedidos en el rango.</div>
        ) : (
          <div style={{ overflowX: 'auto' }} className="u-noscroll">
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 'max-content' }}>
              {/* Encabezado de horas */}
              <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(24, 1fr)`, gap: 3, alignItems: 'center' }}>
                <span />
                {HOURS.map((h) => (
                  <span key={h} style={{ fontSize: 7.5, color: 'var(--u-text-4)', textAlign: 'center' }}>
                    {h % 3 === 0 ? h : ''}
                  </span>
                ))}
              </div>
              {WEEKDAYS.map((wd, day) => (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: `34px repeat(24, 1fr)`, gap: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, color: 'var(--u-text-3)' }}>{wd}</span>
                  {HOURS.map((h) => {
                    const c = heatLookup.get(`${day}-${h}`) ?? 0;
                    const intensity = c === 0 ? 0 : 0.18 + (c / a.heatMax) * 0.82;
                    return (
                      <div
                        key={h}
                        title={`${wd} ${String(h).padStart(2, '0')}:00 — ${c} pedido${c === 1 ? '' : 's'}`}
                        style={{
                          width: 16, height: 16, borderRadius: 3,
                          background: c === 0 ? 'color-mix(in srgb, var(--u-text) 4%, transparent)' : `color-mix(in srgb, var(--brand-accent) ${Math.round(intensity * 100)}%, transparent)`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Velocidad de productos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <VelocityTable title="Más vendidos" rows={a.topSellers} accent />
        <VelocityTable title="No se mueven (menos vendidos)" rows={a.deadStock} />
      </div>

      {/* Mix por número de pedidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SplitCard title="Pedidos por canal" rows={a.byChannel} total={a.validOrders} />
        <SplitCard title="Pedidos por método de pago" rows={a.byPayment} total={a.validOrders} />
        {a.byZone.length > 0 && <SplitCard title="Pedidos por zona" rows={a.byZone} total={a.validOrders} />}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hero, small }: { label: string; value: string; sub?: string; hero?: boolean; small?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: small ? 17 : hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}

function VelocityTable({ title, rows, accent }: { title: string; rows: Velocity[]; accent?: boolean }) {
  const max = rows.reduce((m, r) => Math.max(m, r.qty), 1);
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--u-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{r.name}</span>
            <span style={{ color: r.qty === 0 ? '#f87171' : 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{r.qty}</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', overflow: 'hidden' }}>
            <div style={{ width: `${(r.qty / max) * 100}%`, height: '100%', background: accent ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 25%, transparent)', borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitCard({ title, rows, total }: { title: string; rows: CountSplit[]; total: number }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--u-text-2)' }}>{r.label}</span>
              <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{r.count} · {pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
