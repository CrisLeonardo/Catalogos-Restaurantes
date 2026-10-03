/* Primitivas de UI del SUPER ADMIN — server-safe (sin hooks).
   Encabezados, KPIs, chips de plan/estado y gráfica de actividad que
   comparten todas las páginas de /super, montadas sobre la librería
   ui/* del rediseño del panel (tokens --adm-*). */

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { planLabel } from '@/lib/db/billing';
import { diaMes, diaSemana } from '@/lib/dates';
import { ChartReadout } from '@/components/ui/chart-readout';

/* Colores por plan — mismos que usa la sidebar del panel admin. */
export const PLAN_DOT: Record<string, string> = {
  BASICO: '#94a3b8', ESTANDAR: '#10b981', PREMIUM: '#6366f1', PRO: '#a855f7',
};

/* ── Encabezado de página ─────────────────────────────────── */
export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
}: {
  /** Sin título cuando sería el mismo de la barra de arriba («Restaurantes»
   *  sobre «Restaurantes»): la barra ya nombra la pantalla (auditoría
   *  2026-10-02, T-10). Lo llevan las fichas, cuyo nombre no está en la barra. */
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {backHref && (
        <Link
          href={backHref}
          style={{ fontSize: 13, color: 'var(--u-text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 4 }}
        >
          <Icon name="chevronLeft" size={14} /> {backLabel ?? 'Volver'}
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {title && <h1 className="t-display" style={{ fontSize: 24, marginBottom: subtitle ? 5 : 0 }}>{title}</h1>}
          {subtitle && <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 640 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}

/* ── Tarjeta KPI ──────────────────────────────────────────── */
export function StatCard({
  label,
  value,
  icon,
  tone,
  sub,
  growth,
  href,
}: {
  label: string;
  value: string | number;
  icon?: string;
  /** Solo `warn` y `danger` tiñen la cifra; los demás se dejan por
   *  compatibilidad y se pintan como el resto (D-8). */
  tone?: 'ok' | 'danger' | 'warn' | 'accent' | 'info';
  sub?: string;
  /** % de crecimiento vs. periodo previo (pinta ▲/▼). */
  growth?: number | null;
  href?: string;
}) {
  /* El mismo dibujo que <Stat> del panel (D-8, auditoría 2026-10-02): rótulo
     en minúscula, cifra en la mono del panel y color SOLO cuando pide
     atención (aviso, peligro). Antes: rótulo de cartel en mayúsculas y cifra
     en Unbounded de colores — verde, naranja, azul — sin que el color
     significara nada distinto de «otra tarjeta». */
  const color =
    tone === 'danger' ? 'var(--c-danger)'
    : tone === 'warn' ? 'var(--c-warn)'
    : 'var(--u-text)';

  const inner = (
    <Card
      variant={href ? 'interactive' : 'default'}
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, height: '100%', containerType: 'inline-size' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        {icon && <Icon name={icon} size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
        <span style={{ fontSize: 13, color: 'var(--u-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      {/* La cifra se mide contra el ancho de SU tarjeta (`cqi`), no contra
          la pantalla: con el separador de miles «Q1,495.00» se salía en el
          teléfono (auditoría 2026-10-02, T-01). Un importe nunca se corta. */}
      <div className="t-mono" style={{ fontWeight: 600, fontSize: 'clamp(16px, 10.5cqi, 26px)', lineHeight: 1.1, color, letterSpacing: '-0.02em', minWidth: 0, whiteSpace: 'nowrap' }}>
        {value}
      </div>
      {growth != null ? (
        <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
          {growth >= 0 ? '↑' : '↓'} {Math.abs(growth).toFixed(0)} % vs. mes previo
        </div>
      ) : sub ? (
        <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{sub}</div>
      ) : null}
    </Card>
  );

  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</Link> : inner;
}

/* ── Chips de plan y estado ───────────────────────────────── */
export function PlanChip({ plan }: { plan: string | null | undefined }) {
  const p = plan ?? 'BASICO';
  const dot = PLAN_DOT[p] ?? '#94a3b8';
  return (
    <Badge
      variant="neutral"
      /* La TINTA mezcla el color del plan con la del texto: el color puro
         era legible en oscuro y en el claro por defecto se quedaba en
         2.3:1 («Estándar» verde, «Básico» gris sobre blanco). */
      style={{ background: `color-mix(in srgb, ${dot} 13%, transparent)`, color: `color-mix(in srgb, ${dot} 62%, var(--u-text))`, borderColor: `color-mix(in srgb, ${dot} 28%, transparent)` }}
    >
      {planLabel(p)}
    </Badge>
  );
}

export function StatusChip({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <Badge variant={active ? 'ok' : 'danger'}>
      <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'currentColor', flexShrink: 0 }} />
      {active ? 'Activo' : 'Suspendido'}
    </Badge>
  );
}

/* ── Banner de éxito (tras un redirect ?saved=…) ──────────── */
export function SavedBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--c-ok) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--c-ok) 25%, transparent)',
        color: 'var(--c-ok)',
        fontSize: 14,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}
    >
      <Icon name="checkCircle" size={16} style={{ flexShrink: 0 }} />
      {message}
    </div>
  );
}

/* ── Estado vacío ─────────────────────────────────────────── */
export function EmptyState({
  icon = 'sparkle',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card style={{ padding: '44px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 46, height: 46, borderRadius: 'var(--radius-lg)', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)', color: 'var(--brand-accent-ink)' }}>
        <Icon name={icon} size={22} />
      </span>
      <div style={{ fontWeight: 650, fontSize: 15.5, color: 'var(--u-text)' }}>{title}</div>
      {body && <p className="t-mute" style={{ fontSize: 13.5, maxWidth: 420, lineHeight: 1.55 }}>{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </Card>
  );
}

/* ── Gráfica de ingresos por mes (12 meses) ───────────────── */
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function IncomeChart({
  points,
  currencySymbol = 'Q',
  height = 150,
}: {
  points: { month: string; total: number; count: number }[];
  currencySymbol?: string;
  height?: number;
}) {
  const max = Math.max(...points.map((p) => p.total), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {points.map((p, i) => {
        const [, m] = p.month.split('-').map(Number);
        const label = MONTH_SHORT[(m - 1) % 12];
        const isLast = i === points.length - 1;
        const barH = p.total > 0 ? Math.max((p.total / max) * (height - 34), 4) : 2;
        return (
          <div
            key={p.month}
            title={`${label} ${p.month.slice(0, 4)}: ${currencySymbol}${p.total.toLocaleString('es-GT', { maximumFractionDigits: 0 })} · ${p.count} ${p.count === 1 ? 'pago' : 'pagos'}`}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 5, height: '100%' }}
          >
            {p.total > 0 && (
              <span style={{ fontSize: 11, fontFamily: 'var(--ui-font-mono)', color: isLast ? 'var(--brand-accent)' : 'var(--u-text-4)', fontWeight: isLast ? 800 : 600, whiteSpace: 'nowrap' }}>
                {currencySymbol}{p.total >= 1000 ? `${(p.total / 1000).toFixed(p.total >= 10000 ? 0 : 1)}k` : p.total.toLocaleString('es-GT', { maximumFractionDigits: 0 })}
              </span>
            )}
            <div
              style={{
                width: '70%', height: barH, borderRadius: '4px 4px 0 0',
                background: isLast ? 'var(--chart-hi)' : p.total > 0 ? 'var(--chart-alt)' : 'var(--chart-empty)',
              }}
            />
            <span style={{ fontSize: 11, color: isLast ? 'var(--u-text-2)' : 'var(--u-text-4)', fontWeight: isLast ? 700 : 500 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Gráfica de actividad diaria (visitas + pedidos) ──────── */
/** «lun 28 sept · 40 visitas · 3 pedidos» — lo que dice una columna al tocarla. */
export function activityTip(d: { date: string; visits: number; orders: number }, isToday = false, extra?: string): string {
  const v = `${d.visits.toLocaleString('es-GT')} ${d.visits === 1 ? 'visita' : 'visitas'}`;
  const o = `${d.orders.toLocaleString('es-GT')} ${d.orders === 1 ? 'pedido' : 'pedidos'}`;
  return [isToday ? 'hoy' : diaSemana(d.date), v, o, extra].filter(Boolean).join(' · ');
}

export function ActivityChart({
  series,
  height = 130,
}: {
  series: { date: string; visits: number; orders: number }[];
  height?: number;
}) {
  const maxVisits = Math.max(...series.map((s) => s.visits), 1);
  const maxOrders = Math.max(...series.map((s) => s.orders), 1);
  const totalV = series.reduce((s, d) => s + d.visits, 0);
  const totalO = series.reduce((s, d) => s + d.orders, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--u-text-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-base)' }} />
          Visitas · {totalV.toLocaleString('es-GT')}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-hi)' }} />
          Pedidos · {totalO.toLocaleString('es-GT')}
        </span>
      </div>
      <ChartReadout defaultTip={series.length ? activityTip(series[series.length - 1], true) : undefined}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
        {series.map((d, i) => (
          <div
            key={d.date}
            data-tip={activityTip(d, i === series.length - 1)}
            style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1, minWidth: 0, height: '100%' }}
          >
            <div style={{ width: '42%', height: `${(d.visits / maxVisits) * 100}%`, minHeight: d.visits > 0 ? 3 : 1, background: 'var(--chart-base)', borderRadius: '2px 2px 0 0' }} />
            <div style={{ width: '42%', height: `${(d.orders / maxOrders) * 100}%`, minHeight: d.orders > 0 ? 3 : 1, background: 'var(--chart-hi)', borderRadius: '2px 2px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--u-text-4)' }}>
        <span>{series[0] ? diaMes(series[0].date) : null}</span>
        <span>hoy</span>
      </div>
      </ChartReadout>
    </div>
  );
}
