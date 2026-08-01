'use client';

import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import type { OrderRating, RatingsSummary } from '@/lib/db/encuestas';

interface Props {
  ratings: OrderRating[];
  summary: RatingsSummary;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= Math.round(value) ? 'var(--c-warn)' : 'none'} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function DistBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', width: 14, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 8%, transparent)' }}>
        <div style={{ height: '100%', borderRadius: 99, background: 'var(--c-warn)', width: `${pct}%`, transition: 'width 400ms' }} />
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

export default function EncuestasPanel({ ratings, summary }: Props) {
  const avgDisplay = summary.average > 0 ? summary.average.toFixed(1) : '—';
  const avgMonthDisplay = summary.avgThisMonth > 0 ? summary.avgThisMonth.toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Promedio general', value: avgDisplay, sub: summary.total > 0 ? `${summary.total} reseñas` : 'Sin reseñas', accent: true },
          { label: 'Este mes', value: avgMonthDisplay, sub: `${summary.thisMonth} reseñas` },
          { label: 'Total reseñas', value: String(summary.total) },
        ].map(({ label, value, sub, accent }) => (
          <Card key={label} className="p-3.5">
            <div style={{ fontSize: 26, fontWeight: 800, color: accent ? 'var(--c-warn)' : 'var(--u-text)', fontFamily: 'var(--font-display)' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 1 }}>{sub}</div>}
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 4 }}>{label}</div>
          </Card>
        ))}
      </div>

      {/* .enc-cols: lado a lado en escritorio, apilado en móvil */}
      <div className="enc-cols">
        {/* Distribución */}
        <Card className="p-4">
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--u-text)', marginBottom: 12 }}>Distribución</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {([5, 4, 3, 2, 1] as const).map((s) => (
              <DistBar key={s} label={String(s)} count={summary.distribution[s]} total={summary.total} />
            ))}
          </div>
        </Card>

        {/* Reseñas recientes */}
        <Card className="p-4">
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--u-text)', marginBottom: 12 }}>Reseñas recientes</div>
          {ratings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--u-text-3)' }}>
              <Icon name="thumbsUp" size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
              <div style={{ fontSize: 13 }}>Aún no hay reseñas</div>
              <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 4 }}>
                Las calificaciones aparecerán aquí cuando tus clientes respondan la encuesta.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
              {ratings.map((r) => (
                <div key={r.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Stars value={r.rating} />
                      <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
                        {r.customer_name || 'Anónimo'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--u-text-4)', flexShrink: 0 }}>
                      {new Date(r.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {r.comment && (
                    <p style={{ fontSize: 12.5, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.4, fontStyle: 'italic' }}>
                      “{r.comment}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--c-alt-bg)', border: '1px solid var(--c-alt-line)', fontSize: 13, color: 'var(--u-text-3)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="helpCircle" size={16} style={{ color: 'var(--c-alt)', flexShrink: 0 }} />
        Los clientes reciben un enlace de calificación al finalizar su pedido. La encuesta es anónima y toma menos de 30 segundos.
      </div>
    </div>
  );
}
