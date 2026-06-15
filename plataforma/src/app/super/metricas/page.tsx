import Link from 'next/link';
import { Glass } from '@/components/glass';
import { getGlobalMetrics, getAllRestaurants, getAllRestaurantsTraffic } from '@/lib/db/super-admin';

export const metadata = { title: 'Métricas — Super Admin' };

export default async function MetricasPage() {
  const [metrics, restaurants, traffic] = await Promise.all([
    getGlobalMetrics(),
    getAllRestaurants(),
    getAllRestaurantsTraffic(),
  ]);

  const totalVisits30 = [...traffic.values()].reduce((s, t) => s + t.visits30, 0);
  const totalOrders30 = [...traffic.values()].reduce((s, t) => s + t.orders30, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1 className="t-display" style={{ fontSize: 24, marginBottom: 6 }}>
          Métricas
        </h1>
        <p className="t-mute" style={{ fontSize: 14 }}>
          Vista global de la plataforma · haz clic en un restaurante para ver sus métricas a fondo
        </p>
      </div>

      {/* Métricas globales */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 16,
            marginBottom: 14,
            color: 'var(--u-text-2)',
          }}
        >
          Restaurantes
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard
            label="Activos"
            value={metrics.active}
            color="#4ade80"
          />
          <MetricCard
            label="Suspendidos"
            value={metrics.suspended}
            color="#f87171"
          />
          <MetricCard
            label="Premium"
            value={metrics.premium}
            color="#f08060"
          />
          <MetricCard label="Catálogo" value={metrics.catalogo} />
        </div>
      </section>

      {/* Tráfico global (30 días) */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 16,
            marginBottom: 14,
            color: 'var(--u-text-2)',
          }}
        >
          Tráfico · últimos 30 días
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <MetricCard label="Visitas" value={totalVisits30} />
          <MetricCard label="Pedidos" value={totalOrders30} color="#4ade80" />
        </div>
      </section>

      {/* Tabla de restaurantes recientes */}
      {restaurants.length > 0 && (
        <section>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 16,
              marginBottom: 14,
              color: 'var(--u-text-2)',
            }}
          >
            Todos los restaurantes
          </h2>
          <Glass variant="quiet" style={{ overflow: 'hidden' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 14,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--u-hair)',
                  }}
                >
                  {['Nombre', 'Slug', 'Plan', 'Estado', 'Visitas 30d', 'Únicos', 'Pedidos 30d', 'Alta'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--u-text-3)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom:
                        i < restaurants.length - 1
                          ? '1px solid var(--u-hair)'
                          : 'none',
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        fontWeight: 500,
                      }}
                    >
                      <Link
                        href={`/super/metricas/${r.id}`}
                        style={{ color: 'var(--u-text)', textDecoration: 'none' }}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--u-text-4)',
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                    >
                      {r.slug}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-full)',
                          background:
                            r.plan_actual === 'PREMIUM'
                              ? 'rgba(217,119,87,0.15)'
                              : 'rgba(255,255,255,0.06)',
                          color:
                            r.plan_actual === 'PREMIUM'
                              ? '#f08060'
                              : 'var(--u-text-3)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {r.plan_actual === 'PREMIUM' ? 'PREMIUM' : 'CATÁLOGO'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-full)',
                          background:
                            r.status === 'active'
                              ? 'rgba(34,197,94,0.12)'
                              : 'rgba(239,68,68,0.12)',
                          color:
                            r.status === 'active' ? '#4ade80' : '#f87171',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {r.status === 'active' ? 'ACTIVO' : 'SUSP.'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--u-text-2)',
                        fontFamily: 'monospace',
                        fontSize: 13,
                      }}
                    >
                      {traffic.get(r.id)?.visits30 ?? 0}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--u-text-3)',
                        fontFamily: 'monospace',
                        fontSize: 13,
                      }}
                    >
                      {traffic.get(r.id)?.unique30 ?? 0}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--u-text-2)',
                        fontFamily: 'monospace',
                        fontSize: 13,
                      }}
                    >
                      {traffic.get(r.id)?.orders30 ?? 0}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--u-text-4)',
                        fontSize: 12,
                      }}
                    >
                      {new Date(r.created_at).toLocaleDateString('es', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Glass>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Glass
      variant="quiet"
      style={{ padding: '20px 16px', textAlign: 'center' }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 36,
          color: color ?? 'var(--u-text)',
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500 }}>
        {label}
      </div>
    </Glass>
  );
}
