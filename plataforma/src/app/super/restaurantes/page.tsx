import Link from 'next/link';
import { Glass } from '@/components/glass';
import { getAllRestaurants } from '@/lib/db/super-admin';

export const metadata = { title: 'Restaurantes — Super Admin' };

export default async function RestaurantesPage() {
  const restaurants = await getAllRestaurants();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1
            className="t-display"
            style={{ fontSize: 24, marginBottom: 4 }}
          >
            Restaurantes
          </h1>
          <p className="t-mute" style={{ fontSize: 14 }}>
            {restaurants.length}{' '}
            {restaurants.length === 1 ? 'restaurante' : 'restaurantes'} en la
            plataforma
          </p>
        </div>
        <Link
          href="/super/restaurantes/new"
          className="press btn-accent"
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + Nuevo
        </Link>
      </div>

      {/* Lista */}
      {restaurants.length === 0 ? (
        <Glass
          variant="quiet"
          style={{ padding: 48, textAlign: 'center' }}
        >
          <p className="t-mute" style={{ fontSize: 15, marginBottom: 20 }}>
            No hay restaurantes todavía.
          </p>
          <Link
            href="/super/restaurantes/new"
            className="press btn-accent"
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Crear el primero
          </Link>
        </Glass>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {restaurants.map((r) => {
            const theme = r.restaurant_themes[0];
            return (
              <Link
                key={r.id}
                href={`/super/restaurantes/${r.id}`}
                style={{ textDecoration: 'none' }}
              >
                <Glass
                  variant="quiet"
                  className="press"
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: 'pointer',
                  }}
                >
                  {/* Dot de color del tema */}
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background:
                        theme?.color_primary ?? 'var(--brand-accent)',
                      flexShrink: 0,
                    }}
                  />

                  {/* Nombre + slug */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: 'var(--u-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--u-text-4)',
                        marginTop: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      {r.slug}
                    </div>
                  </div>

                  {/* Plan badge */}
                  <PlanBadge plan={r.plan_actual} />

                  {/* Status badge */}
                  <StatusBadge status={r.status} />

                  <span
                    style={{ color: 'var(--u-text-4)', fontSize: 16, flexShrink: 0 }}
                  >
                    ›
                  </span>
                </Glass>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const isPremium = plan === 'PREMIUM';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 'var(--radius-full)',
        background: isPremium
          ? 'rgba(217,119,87,0.15)'
          : 'rgba(255,255,255,0.06)',
        color: isPremium ? '#f08060' : 'var(--u-text-3)',
        border: `1px solid ${isPremium ? 'rgba(217,119,87,0.3)' : 'var(--u-hair)'}`,
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}
    >
      {isPremium ? 'PREMIUM' : 'CATÁLOGO'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 'var(--radius-full)',
        background: isActive
          ? 'rgba(34,197,94,0.12)'
          : 'rgba(239,68,68,0.12)',
        color: isActive ? '#4ade80' : '#f87171',
        border: `1px solid ${isActive ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}
    >
      {isActive ? 'ACTIVO' : 'SUSPENDIDO'}
    </span>
  );
}
