import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { describeDevice, type AccessRow } from '@/lib/auth/access-log';

const METHOD_LABEL: Record<string, string> = {
  password: 'Correo y contraseña',
  google: 'Cuenta de Google',
  mi_cuenta: 'Desde Mi cuenta',
  pin: 'PIN',
  soporte: 'Soporte de Leogin',
};

/** La IP solo sirve si dice algo: las de la propia máquina o de la red del
 *  local (`::1`, `127.0.0.1`, `192.168.x.x`) no ayudan a reconocer un acceso
 *  ajeno, y el prefijo `::ffff:` es ruido técnico. */
function ipLegible(ip: string | null): string | null {
  if (!ip) return null;
  const limpia = ip.replace(/^::ffff:/i, '');
  if (/^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(limpia)) return null;
  return limpia;
}

/** Un ingreso desde Mi cuenta deja DOS filas en el mismo minuto (el de la
 *  cuenta y el del panel): la lista repetía cada acceso dos veces. Se queda
 *  la más reciente de cada grupo «misma persona, mismo aparato, ≤ 2 min». */
function sinDuplicados(rows: AccessRow[]): AccessRow[] {
  const out: AccessRow[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (
      prev
      && prev.actor_name === r.actor_name
      && describeDevice(prev.user_agent) === describeDevice(r.user_agent)
      && Math.abs(new Date(prev.created_at).getTime() - new Date(r.created_at).getTime()) <= 2 * 60_000
    ) continue;
    out.push(r);
  }
  return out;
}

/** Filas a la vista; el resto, detrás de «Ver más». */
const VISIBLES = 8;

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
  const lista = sinDuplicados(rows);
  return (
    /* Este bloque era el cuarto tratamiento distinto de encabezado de la
       pantalla: icono + <h2> de 15 px en negrita, mientras sus tres vecinos
       usaban `.adm-label`. Ahora es un <Section> como todos. */
    <Section title="Últimos accesos al panel">
      <Card style={{ padding: 18 }}>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Cada vez que alguien entra a tu panel queda anotado aquí. Si ves un acceso que no
        reconoces, cambia tu contraseña.
      </p>

      {lista.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0 }}>
          Todavía no hay accesos registrados.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lista.slice(0, VISIBLES).map((r) => <Fila key={r.id} r={r} timezone={timezone} />)}
          {lista.length > VISIBLES && (
            /* <details> y no un estado de React: este bloque es de servidor y
               así sigue sin mandar JavaScript al navegador. */
            <details style={{ borderTop: '1px solid var(--u-hair)' }}>
              <summary style={{ cursor: 'pointer', padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}>
                Ver {lista.length - VISIBLES} {lista.length - VISIBLES === 1 ? 'acceso más' : 'accesos más'}
              </summary>
              {lista.slice(VISIBLES).map((r) => <Fila key={r.id} r={r} timezone={timezone} />)}
            </details>
          )}
        </div>
      )}
      </Card>
    </Section>
  );
}

function Fila({ r, timezone }: { r: AccessRow; timezone: string }) {
  const ip = ipLegible(r.ip);
  return (
    <div
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
          {ip ? ` · ${ip}` : ''}
        </div>
      </div>
      <span
        style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)',
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
  );
}
