'use client';

import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Stat, StatGroup } from '@/components/ui/stat';
import type { OrderRating, RatingsSummary } from '@/lib/db/encuestas';
import { useState } from 'react';

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
      <span style={{ fontSize: 11, color: 'var(--u-text-3)', width: 14, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 8%, transparent)' }}>
        <div style={{ height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--chart-hi)', width: `${pct}%`, transition: 'width 400ms' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--u-text-4)', width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

export default function EncuestasPanel({ ratings, summary }: Props) {
  /* Cinco a la vista y «Ver todas»: antes la lista tenía su propio scroll
     de 400 px dentro de la página — scroll dentro de scroll, que en el
     teléfono atrapa el dedo (auditoría 2026-10-02, CLI-04). */
  const [allReviews, setAllReviews] = useState(false);
  const shownRatings = allReviews ? ratings : ratings.slice(0, 5);
  const avgDisplay = summary.average > 0 ? summary.average.toFixed(1) : '—';
  const avgMonthDisplay = summary.avgThisMonth > 0 ? summary.avgThisMonth.toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <StatGroup>
        <Stat label={summary.total > 0 ? `Promedio general (${summary.total} reseñas)` : 'Promedio general (sin reseñas)'} value={avgDisplay} />
        <Stat label={`Este mes (${summary.thisMonth} reseñas)`} value={avgMonthDisplay} />
        <Stat label="Total reseñas" value={String(summary.total)} />
      </StatGroup>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shownRatings.map((r) => (
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
                    <p style={{ fontSize: 12, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.4, fontStyle: 'italic' }}>
                      “{r.comment}”
                    </p>
                  )}
                </div>
              ))}
              {ratings.length > 5 && (
                <button
                  type="button"
                  onClick={() => setAllReviews((v) => !v)}
                  className="press"
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: 'var(--brand-accent-ink)', fontSize: 13, fontWeight: 600 }}
                >
                  {allReviews ? 'Ver menos' : `Ver todas (${ratings.length})`}
                </button>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="note note-info" style={{ fontSize: 13, fontWeight: 500 }}>
        <Icon name="helpCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        Los clientes reciben un enlace de calificación al finalizar su pedido. La encuesta es anónima y toma menos de 30 segundos.
      </div>
    </div>
  );
}
