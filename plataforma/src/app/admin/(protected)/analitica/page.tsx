import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getAnalytics, type CountSplit, type Velocity } from '@/lib/db/analytics';
import { can } from '@/lib/permissions';
import DateRangeForm from '@/components/admin/date-range-form';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { panelLink } from '@/lib/panel-links-server';

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
  if (!can(ctx.profile.role, ctx.profile.permissions, 'analitica')) redirect(await panelLink('/admin'));

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
        icon="chart"
        title="Analítica todavía no está activa"
        desc="Se basa en los pedidos en línea. Activa el módulo Pedidos (plan Estándar) para ver horas pico, velocidad de productos, cancelaciones y tiempos."
        action={{ href: '/admin/suscripcion', label: 'Ver planes' }}
      />
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
      <Card className="p-4">
        <DateRangeForm from={from} to={to} basePath="/admin/analitica" />
      </Card>

      <Section title="Resumen del rango">
        <StatGroup>
          {/* Sin paréntesis en los rótulos: el dato de apoyo va debajo de la
              cifra (auditoría 2026-10-02, NEG-03). */}
          <Stat label="Pedidos válidos" value={String(a.validOrders)} sub={`de ${a.totalOrders} en total`} />
          <Stat label="Cancelados" value={`${a.cancelRate.toFixed(0)}%`} sub={a.cancelled === 1 ? '1 pedido' : `${a.cancelled} pedidos`} />
          <Stat label="Prep. promedio" value={a.prepSamples > 0 ? fmtMin(a.avgPrepMin) : 'Sin datos aún'} />
          <Stat label="Entrega promedio" value={a.deliverySamples > 0 ? fmtMin(a.avgDeliveryMin) : 'Sin datos aún'} />
          <Stat label="Hora pico" value={a.peakLabel ?? '–'} sub={a.busiestWeekday ? `Día más fuerte: ${a.busiestWeekday}` : undefined} />
        </StatGroup>
      </Section>

      {a.avgPrepMin == null && a.validOrders > 0 && (
        <Card className="p-3.5" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Los tiempos de preparación y entrega se miden desde que cambias el estado de los
          pedidos (Nuevo → Listo → Entregado). Empezarán a aparecer con los próximos pedidos.
        </Card>
      )}

      {/* Mapa de calor de horas pico */}
      <Card className="flex flex-col gap-3 p-4.5">
        <div className="adm-label">Horas pico · pedidos por día y hora</div>
        {a.heatMax === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin pedidos en el rango.</div>
        ) : (
          <div style={{ overflowX: 'auto' }} className="u-noscroll">
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 'max-content' }}>
              {/* Encabezado de horas */}
              <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(24, 1fr)`, gap: 3, alignItems: 'center' }}>
                <span />
                {HOURS.map((h) => (
                  <span key={h} style={{ fontSize: 11, color: 'var(--u-text-4)', textAlign: 'center' }}>
                    {h % 3 === 0 ? h : ''}
                  </span>
                ))}
              </div>
              {WEEKDAYS.map((wd, day) => (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: `34px repeat(24, 1fr)`, gap: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--u-text-3)' }}>{wd}</span>
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
      </Card>

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

function VelocityTable({ title, rows, accent }: { title: string; rows: Velocity[]; accent?: boolean }) {
  const max = rows.reduce((m, r) => Math.max(m, r.qty), 1);
  return (
    <Card className="flex flex-col gap-2 p-4.5">
      <div className="adm-label">{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--u-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{r.name}</span>
            <span style={{ color: r.qty === 0 ? 'var(--c-danger)' : 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{r.qty}</span>
          </div>
          <div style={{ height: 5, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', overflow: 'hidden' }}>
            <div style={{ width: `${(r.qty / max) * 100}%`, height: '100%', background: accent ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 25%, transparent)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function SplitCard({ title, rows, total }: { title: string; rows: CountSplit[]; total: number }) {
  return (
    <Card className="flex flex-col gap-3 p-4.5">
      <div className="adm-label">{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin datos en el rango.</div>
      ) : rows.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--u-text-2)' }}>{r.label}</span>
              <span style={{ color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{r.count} · {pct.toFixed(0)}%</span>
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
