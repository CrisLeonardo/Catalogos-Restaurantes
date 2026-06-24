import { getRestaurantGmvCurrentMonth, planLabel } from '@/lib/db/billing';
import { Icon } from '@/components/icons';

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

export default async function PlanGmvBar({ restaurantId }: { restaurantId: string }) {
  const { gmv, limit, pct, plan } = await getRestaurantGmvCurrentMonth(restaurantId);

  // Solo mostrar para planes con límite fijo (no BASICO, no VARIABLE)
  if (limit === null) return null;

  const pctSafe = pct ?? 0;
  const barColor =
    pctSafe >= 1.0 ? '#f87171'
    : pctSafe >= 0.8 ? '#fb923c'
    : pctSafe >= 0.6 ? '#fbbf24'
    : '#4ade80';

  const isOver = pctSafe >= 1.0;
  const isNear = pctSafe >= 0.8 && !isOver;

  return (
    <div
      className="glass"
      style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="chart" size={15} style={{ color: 'var(--u-text-3)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ventas digitales este mes
          </span>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
          Plan {planLabel(plan)}
        </span>
      </div>

      {/* Barra de progreso */}
      <div>
        <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(pctSafe * 100, 100)}%`,
              borderRadius: 99,
              background: barColor,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontFamily: 'var(--ui-font-mono)' }}>
            {fmtQ(gmv)}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
            de {fmtQ(limit)}
          </span>
        </div>
      </div>

      {/* Banner de alerta */}
      {isOver && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
        }}>
          <Icon name="alertCircle" size={15} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#f87171', lineHeight: 1.4 }}>
            Has superado el límite de tu plan este mes. Nos pondremos en contacto contigo.
          </span>
        </div>
      )}
      {isNear && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          borderRadius: 10, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)',
        }}>
          <Icon name="alertCircle" size={15} style={{ color: '#fb923c', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#fb923c', lineHeight: 1.4 }}>
            Estás al {Math.round(pctSafe * 100)}% de tu límite mensual. Considera actualizar tu plan.
          </span>
        </div>
      )}
    </div>
  );
}
