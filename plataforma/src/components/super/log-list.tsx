import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { EmptyState } from '@/components/super/ui';
import type { LogRow } from '@/lib/db/super-admin-log';
import type { AccionSuper } from '@/lib/super-admin-log';

/* La bitácora, pintada (fase 3).
   ------------------------------------------------------------
   La misma lista en dos sitios: la pantalla propia y la ficha de cada
   persona. En la ficha es donde de verdad sirve —cuando alguien llama
   preguntando qué pasó con su cuenta, la respuesta está en la pantalla
   que ya estás mirando— y por eso no es una pantalla y ya.

   Cada fila se lee sola: el texto viene congelado de la propia fila
   (`targetLabel`), no se resuelve al pintar. Una entrada sobre un
   restaurante borrado sigue diciendo cómo se llamaba. */

/* Qué hizo cada acción, en una frase, y con qué ícono.

   DOS redacciones, y no es coquetería: dentro de la ficha de una persona
   el objetivo se oculta —ya se sabe de quién es la pantalla— y una frase
   escrita para la lista general se queda colgando («Repuso la contraseña
   de» y nada detrás). Cada acción trae la suya con objetivo y sin él.

   El tipo es `Record<AccionSuper, …>` y no `Record<string, …>` a propósito:
   así, el día que alguien añada una acción y no escriba su frase, no compila.
   Sin eso la fila saldría enseñando el nombre interno —«acceso.quitar»— y
   nadie se enteraría hasta verlo en pantalla. */
const ACCION: Record<AccionSuper, {
  conObjetivo: string;
  solo: string;
  icon: string;
  grave?: boolean;
  /** La acción hizo desaparecer el objetivo: enlazar a él lleva a un 404. */
  borraElObjetivo?: boolean;
}> = {
  'cuenta.contrasena': {
    conObjetivo: 'Repuso la contraseña de', solo: 'Repuso la contraseña', icon: 'key',
  },
  'cuenta.correo': {
    conObjetivo: 'Corrigió el correo de', solo: 'Corrigió el correo', icon: 'edit',
  },
  'cuenta.enlace-recuperacion': {
    conObjetivo: 'Mandó el enlace de recuperación a', solo: 'Mandó el enlace de recuperación', icon: 'mail',
  },
  'acceso.crear': {
    conObjetivo: 'Creó el acceso', solo: 'Creó un acceso', icon: 'userPlus',
  },
  'acceso.dar': {
    conObjetivo: 'Dio acceso a', solo: 'Le dio acceso al restaurante', icon: 'userPlus',
  },
  'acceso.rol': {
    conObjetivo: 'Cambió el papel de', solo: 'Cambió su papel', icon: 'users',
  },
  'acceso.contrasena': {
    conObjetivo: 'Repuso la contraseña del acceso', solo: 'Repuso la contraseña de su acceso', icon: 'key',
  },
  'acceso.quitar': {
    conObjetivo: 'Quitó el acceso', solo: 'Quitó su acceso', icon: 'trash', grave: true, borraElObjetivo: true,
  },
  'restaurante.borrar': {
    conObjetivo: 'Borró el restaurante', solo: 'Borró su restaurante', icon: 'trash', grave: true, borraElObjetivo: true,
  },
  'restaurante.plan': {
    conObjetivo: 'Cambió el plan de', solo: 'Cambió el plan', icon: 'wallet',
  },
  'restaurante.estado': {
    conObjetivo: 'Cambió el estado de', solo: 'Cambió el estado', icon: 'alertCircle',
  },
  'grupo.borrar': {
    conObjetivo: 'Borró el grupo', solo: 'Borró un grupo', icon: 'trash', grave: true, borraElObjetivo: true,
  },
};

export default function LogList({
  rows,
  /** Dentro de la ficha de una persona sobra repetir a quién: ya se sabe. */
  ocultarObjetivo = false,
  vacio,
}: {
  rows: LogRow[];
  ocultarObjetivo?: boolean;
  vacio?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="list"
        title="Todavía no hay nada registrado"
        body={vacio ?? 'Aquí aparecerá cada cosa que hagas desde el Super Admin: quién, a quién, cuándo y desde dónde.'}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <LogRowCard key={r.id} row={r} ocultarObjetivo={ocultarObjetivo} />
      ))}
    </div>
  );
}

function LogRowCard({ row, ocultarObjetivo }: { row: LogRow; ocultarObjetivo: boolean }) {
  // `row.action` viene de la base, donde la columna es texto libre: una fila
  // escrita por una versión más nueva del código no puede romper la pantalla.
  const a: (typeof ACCION)[AccionSuper] =
    ACCION[row.action as AccionSuper] ?? { conObjetivo: row.action, solo: row.action, icon: 'list' };
  const color = a.grave ? 'var(--c-danger)' : 'var(--u-text-4)';
  // Sin etiqueta congelada tampoco hay a quién nombrar, aunque se pida.
  const conNombre = !ocultarObjetivo && !!row.targetLabel;

  return (
    <Card style={{ padding: '12px 15px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Icon name={a.icon} size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 13.5, color: 'var(--u-text)', lineHeight: 1.5 }}>
          {conNombre ? a.conObjetivo : a.solo}
          {conNombre && (
            <>
              {' '}
              <strong style={{ fontWeight: 700 }}>{row.targetLabel}</strong>
            </>
          )}
          {detalle(row) &&<span style={{ color: 'var(--u-text-4)' }}> · {detalle(row)}</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: 'var(--u-text-4)', flexWrap: 'wrap' }}>
          <span>{row.actorEmail ?? 'cuenta borrada'}</span>
          <span title={new Date(row.createdAt).toLocaleString('es-GT')}>{cuando(row.createdAt)}</span>
          {row.ip && row.ip !== 'unknown' && (
            <span className="hide-mobile" style={{ fontFamily: 'var(--ui-font-mono)' }}>{row.ip}</span>
          )}
          {/* Si el objetivo ya no existe, la fila sigue diciendo cómo se
              llamaba —para eso se congela el texto— pero no se enlaza a un
              404. `borraElObjetivo` cubre el caso recién hecho, en el que la
              propia acción fue la que lo borró. */}
          {row.targetRestaurantId && !a.borraElObjetivo && row.targetExists && (
            <Link
              href={`/super/restaurantes/${row.targetRestaurantId}`}
              style={{ color: 'var(--brand-accent-ink)', textDecoration: 'none' }}
            >
              ver el restaurante
            </Link>
          )}
          {!ocultarObjetivo && row.targetUserId && !a.borraElObjetivo && row.targetExists && (
            <Link
              href={`/super/cuentas/${row.targetUserId}`}
              style={{ color: 'var(--brand-accent-ink)', textDecoration: 'none' }}
            >
              ver la cuenta
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

const PAPEL: Record<string, string> = {
  OWNER: 'dueño', MANAGER: 'gerente', STAFF: 'personal', WAITER: 'mesero',
};

/** El «de X a Y» de las acciones que cambian un valor. */
function detalle(row: LogRow): string | null {
  const m = row.meta;
  if (!m) return null;

  if (row.action === 'cuenta.correo' && m.antes) return `antes ${String(m.antes)}`;
  if (row.action === 'restaurante.plan') {
    return `${m.antes ? String(m.antes) : '—'} → ${m.despues ? String(m.despues) : '—'}`;
  }
  if (row.action === 'restaurante.estado') {
    return m.estado === 'suspended' ? 'suspendido' : 'activo';
  }
  if (row.action === 'acceso.crear' && m.rol) {
    return m.rol === 'RESTAURANT_OWNER' ? 'como dueño' : 'como personal';
  }
  if (row.action === 'acceso.dar' && m.rol) return `como ${PAPEL[String(m.rol)] ?? String(m.rol)}`;
  if (row.action === 'acceso.rol') {
    return `${PAPEL[String(m.antes)] ?? '—'} → ${PAPEL[String(m.despues)] ?? '—'}`;
  }
  return null;
}

function cuando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}
