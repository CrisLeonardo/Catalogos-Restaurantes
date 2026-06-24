import Link from 'next/link';
import { getRestaurantGmvCurrentMonth } from '@/lib/db/billing';
import { Icon } from '@/components/icons';

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

/** Slim alert banner — shows on ALL admin pages when GMV ≥ 80% of plan limit.
 *  Rendered in the protected layout so it persists across navigation. */
export default async function PlanGmvAlert({ restaurantId }: { restaurantId: string }) {
  const { pct, gmv, limit } = await getRestaurantGmvCurrentMonth(restaurantId);

  if (!limit || pct === null || pct < 0.8) return null;

  const isOver = pct >= 1.0;
  const color  = isOver ? '#f87171' : '#fb923c';
  const bg     = isOver ? 'rgba(248,113,113,0.08)' : 'rgba(251,146,60,0.08)';
  const border = isOver ? 'rgba(248,113,113,0.22)' : 'rgba(251,146,60,0.22)';

  return (
    <Link
      href="/admin/suscripcion"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', borderRadius: 11, marginBottom: 16,
        textDecoration: 'none', background: bg, border: `1px solid ${border}`,
      }}
    >
      <Icon name="alertCircle" size={15} style={{ color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color, lineHeight: 1.4 }}>
        {isOver
          ? `Superaste el límite GMV de tu plan (${fmtQ(gmv)} de ${fmtQ(limit)})`
          : `Al ${Math.round(pct * 100)}% de tu límite GMV este mes · ${fmtQ(gmv)} de ${fmtQ(limit)}`}
      </span>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
        Ver plan →
      </span>
    </Link>
  );
}
