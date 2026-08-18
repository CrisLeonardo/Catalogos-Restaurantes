import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { describeDevice, type AccessRow } from '@/lib/auth/access-log';

const METHOD_LABEL: Record<string, string> = {
  password: 'Correo y contraseña',
  google: 'Cuenta de Google',
  mi_cuenta: 'Desde Mi cuenta',
  pin: 'PIN',
  soporte: 'Soporte de Leogin',
};

function when(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString('es-GT', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone,
    });
  } catch {
    return iso;
  }
}

/**
 * Últimos accesos al panel (migración 109). Se muestra en /admin/personal,
 * junto a la gestión del personal, porque es la misma pregunta: quién tiene
 * acceso a esto y qué ha estado haciendo.
 */
export default function AccessLogPanel({
  rows,
  timezone,
}: {
  rows: AccessRow[];
  timezone: string;
}) {
  return (
    <Card style={{ marginTop: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Icon name="key" size={17} style={{ color: 'var(--brand-accent-ink)' }} />
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
          Últimos accesos al panel
        </h2>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Cada vez que alguien entra a tu panel queda anotado aquí. Si ves un acceso que no
        reconoces, cambia tu contraseña.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0 }}>
          Todavía no hay accesos registrados.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 0', borderTop: '1px solid var(--u-hair)',
              }}
            >
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 13.5, color: 'var(--u-text)', fontWeight: 500 }}>
                  {r.actor_name ?? 'Cuenta sin nombre'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                  {describeDevice(r.user_agent)}
                  {r.ip ? ` · ${r.ip}` : ''}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  whiteSpace: 'nowrap',
                  color: r.method === 'soporte' ? '#f87171' : 'var(--u-text-3)',
                  background: r.method === 'soporte'
                    ? 'rgba(220,50,50,0.12)'
                    : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                  border: `1px solid ${r.method === 'soporte' ? 'rgba(220,50,50,0.25)' : 'var(--u-hair)'}`,
                }}
              >
                {METHOD_LABEL[r.method] ?? r.method}
              </span>
              <span style={{ fontSize: 12, color: 'var(--u-text-4)', whiteSpace: 'nowrap' }}>
                {when(r.created_at, timezone)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
