'use client';

/* La mesa, al lado del plano.
   ------------------------------------------------------------------
   Tocar una mesa ya no cambia de pantalla: se abre aquí, con el plano
   todavía a la vista. Es la diferencia entre «ir a ver la mesa 3» y
   «mirar la mesa 3 sin perder de vista el salón».

   Este panel LEE la cuenta, no cobra: las tres acciones del pie llevan
   al panel de mesero, que es donde vive el pedido. Duplicar aquí el
   cobro o el reparto sería una segunda verdad sobre la misma mesa.

   Lo que SÍ hace desde la migración 128 es el trabajo del puesto de
   mando —sentar, contar cuántos son, decir a quién le toca, soltar—,
   porque eso no es la comanda: es el reparto del salón, y no existe en
   ninguna otra pantalla. Es lo único que hace este panel además de
   leer, y es exactamente lo que lo separa de «Tomar pedidos». */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import type { SalonTable } from '@/components/admin/salon/pieces';
import { estadoDeFicha, estadoInk } from '@/components/admin/salon/pieces';
import type { BillLine as LineaDeCuenta, BillBreakdown } from '@/lib/bill-split';
import BillLine from '@/components/admin/salon/bill-line';
import type { WaiterOption } from '@/lib/db/table-sessions';

export interface BillData {
  lines: LineaDeCuenta[];
  breakdown: BillBreakdown;
}

export default function BillPanel({
  t, data, loading, error, money, sentados, canWaiter, waiters, busy,
  onClose, onCobrar, onDividir, onAgregar, onSentar, onAsignar, onPersonas, onSoltar,
}: {
  t: SalonTable;
  data: BillData | null;
  loading: boolean;
  error: string | null;
  money: (n: number) => string;
  /** «sentados hace 1 h 12 min» — null si no hay reloj todavía. */
  sentados: string | null;
  /** El plan incluye el panel de mesero: sin él las acciones no llevan a ninguna parte. */
  canWaiter: boolean;
  /** A quién se le puede dar la mesa. Vacío = el local no tiene personal
      dado de alta todavía, y entonces el reparto no se ofrece. */
  waiters: WaiterOption[];
  /** Hay una acción de mesa en vuelo: se apagan los controles. */
  busy: boolean;
  onClose: () => void;
  onCobrar: () => void;
  onDividir: () => void;
  onAgregar: () => void;
  /** Sentar gente en una mesa libre. */
  onSentar: (pax: number | null, waiterId: string | null) => void;
  onAsignar: (waiterId: string | null) => void;
  onPersonas: (pax: number | null) => void;
  /** Soltar la mesa sin cobrar: se levantaron sin consumir. */
  onSoltar: () => void;
}) {
  const libre = t.state.kind === 'libre';
  /** Ocupada y sin un solo plato apuntado: sentados, esperando. */
  const sinPedido = !libre && !t.occ;
  const vivas = (data?.lines ?? []).filter((l) => l.quantity > 0);
  const total = data?.breakdown.grandTotal ?? 0;

  /* Lo que se va a anotar al sentar. Nace vacío —«no se preguntó» es una
     respuesta válida y no la misma que «cero personas»— y se olvida al
     cambiar de mesa, porque quien pinta este panel le pone `key` con el
     número: dos mesas distintas no comparten borrador. */
  const [paxNuevo, setPaxNuevo] = useState<number | null>(null);
  const [meseroNuevo, setMeseroNuevo] = useState('');

  return (
    <aside
      className="salon-bill"
      style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 16, border: '1px solid var(--u-hair)',
        background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
      }}
      aria-label={`Cuenta de la mesa ${t.n}`}
    >
      {/* Cabecera: quién es esta mesa y qué le pasa. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 13px', borderBottom: '1px solid var(--u-hair)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
              {t.n}
            </span>
            {t.pax && <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{t.pax.replace(' pers', ' personas')}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: estadoInk(t) }}>
            {estadoDeFicha(t)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>
            {libre
              ? 'Sin abrir'
              : [t.waiterName ?? 'Sin asignar', sentados && `sentados hace ${sentados}`].filter(Boolean).join(' · ')}
          </div>
          {/* Una mesa con gente cuyo número se sale de las configuradas: existe
              de verdad —tiene consumo— y el salón no la tiene dada de alta.
              Antes desaparecía en silencio con el dinero encima (M-03). */}
          {t.fuera && (
            <div style={{ fontSize: 12, color: 'var(--c-warn)', marginTop: 3, lineHeight: 1.4 }}>
              Fuera de las mesas configuradas. Súbele el número en Ajustes › Salón
              o cóbrala para cerrarla.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar la cuenta"
          className="press"
          style={{
            display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
            borderRadius: 9, border: '1px solid var(--u-hair-2)', background: 'none',
            color: 'var(--u-text-2)', cursor: 'pointer',
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Cuerpo: la cuenta tal cual. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {libre ? (
          <>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
              Mesa libre. Anota quién llegó y queda ocupada aunque tarden en pedir:
              así nadie más la sienta y su reloj empieza a contar.
            </p>
            <Personas value={paxNuevo} onChange={setPaxNuevo} disabled={busy} />
            <Mesero
              value={meseroNuevo}
              waiters={waiters}
              disabled={busy}
              onChange={setMeseroNuevo}
            />
          </>
        ) : (
          <>
            {/* Quién la atiende y cuántos son. Va ARRIBA de la cuenta a
                propósito: en hora pico lo que se busca aquí es a quién
                mandar, no cuánto lleva gastado. */}
            <Personas
              value={Math.max(t.seat?.partySize ?? 0, t.occ?.partySize ?? 0) || null}
              onChange={onPersonas}
              disabled={busy}
            />
            <Mesero
              value={t.waiterId ?? ''}
              waiters={waiters}
              disabled={busy}
              /* Sin `waiterId` la mesa la atiende quien apuntó el primer
                 plato, y ese nombre no es una asignación que se pueda
                 cambiar en su sitio: se dice debajo. */
              hint={!t.waiterId && t.waiterName ? `Ahora la lleva ${t.waiterName}, por haber apuntado.` : null}
              onChange={(id) => onAsignar(id || null)}
            />

            {sinPedido ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
                Sentados y todavía sin pedir. La cuenta empieza en cuanto alguien
                les apunte el primer plato.
              </p>
            ) : loading ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)' }}>Cargando la cuenta…</p>
            ) : error ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-danger)', lineHeight: 1.5 }}>{error}</p>
            ) : (
              <>
            <div className="adm-label" style={{ color: 'var(--u-text-3)' }}>La cuenta</div>
            {vivas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)' }}>Todavía no hay platos apuntados.</p>
            ) : vivas.map((l) => (
              /* LA MISMA fila que la pantalla del mesero (M-22). Antes eran
                 dos árboles distintos y ya divergían: aquí no se veían ni
                 el asiento ni en qué iba cada plato, que es justo lo que un
                 encargado mira al abrir una mesa. */
              <BillLine
                key={l.itemId}
                compacta
                money={money}
                l={{
                  key: l.itemId,
                  qty: l.quantity,
                  name: l.name,
                  detail: l.options,
                  note: l.note,
                  price: l.lineTotal,
                  seat: l.seat,
                  status: l.orderStatus,
                }}
              />
            ))}

            {data && (
              <>
                <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
                {data.breakdown.tip > 0 && (
                  <Fila label="Propina" value={money(data.breakdown.tip)} />
                )}
                {data.breakdown.discount > 0 && (
                  <Fila label="Descuento" value={`−${money(data.breakdown.discount)}`} />
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total</span>
                  <span className="t-mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
                    {money(total)}
                  </span>
                </div>
              </>
            )}
              </>
            )}
          </>
        )}
      </div>

      {/* Pie: la acción que toca, y las dos de siempre debajo. */}
      <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--u-hair)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!canWaiter && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
            Cobrar y agregar platos se hace desde el panel de mesero, que no está en tu plan.
            Sentar y repartir sí se hacen aquí.
          </p>
        )}

        {/* Sentar NO depende del panel de mesero: es trabajo de esta pantalla
            y tiene que funcionar en un Estándar con «comer en local». */}
        {libre ? (
          <button
            type="button"
            className="press btn-accent"
            onClick={() => onSentar(paxNuevo, meseroNuevo || null)}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 12, border: 'none', cursor: busy ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 600, opacity: busy ? 0.55 : 1, width: '100%',
            }}
          >
            <Icon name="users" size={18} />
            {paxNuevo ? `Sentar ${paxNuevo}` : 'Sentar'}
          </button>
        ) : (
          <button
            type="button"
            className="press btn-accent"
            onClick={sinPedido ? onAgregar : onCobrar}
            disabled={!canWaiter}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 12, border: 'none', cursor: canWaiter ? 'pointer' : 'default',
              fontSize: 15, fontWeight: 600, opacity: canWaiter ? 1 : 0.55, width: '100%',
            }}
          >
            <Icon name={sinPedido ? 'plus' : 'creditCard'} size={18} />
            {sinPedido ? 'Tomar el pedido' : total > 0 ? `Cobrar ${money(total)}` : 'Cobrar'}
          </button>
        )}

        {libre && (
          <Secundario icon="plus" label="Abrir mesa y pedir" onClick={onAgregar} disabled={!canWaiter} />
        )}

        {/* Sentados sin consumo: lo único que se puede hacer además de irles
            a tomar el pedido es soltarlos —se levantaron—. Dividir y cobrar
            una cuenta que no existe no son opciones, así que no se ofrecen. */}
        {sinPedido && (
          <Secundario icon="x" label="Soltar la mesa" onClick={onSoltar} disabled={busy} />
        )}

        {!libre && !sinPedido && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Secundario icon="list" label="Dividir" onClick={onDividir} disabled={!canWaiter} />
            <Secundario icon="plus" label="Agregar" onClick={onAgregar} disabled={!canWaiter} />
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Cuántos son ───────────────────────────────────────────────
   Con botones y no con un campo de escribir: se usa de pie, con una
   mano, y el número real casi siempre está entre uno y seis. Vacío es
   una respuesta legítima —«no lo pregunté»— y por eso se puede volver
   a él, en vez de dejar un 2 inventado escrito en la base. */
function Personas({ value, onChange, disabled }: {
  value: number | null;
  onChange: (n: number | null) => void;
  disabled?: boolean;
}) {
  const paso = (d: number) => {
    const n = (value ?? 0) + d;
    onChange(n < 1 ? null : Math.min(n, 100));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--u-text-2)' }}>Personas</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Paso icon="minus" label="Una persona menos" onClick={() => paso(-1)} disabled={disabled || value == null} />
        <span
          className="t-mono"
          style={{
            minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: 700,
            color: value == null ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {value ?? '—'}
        </span>
        <Paso icon="plus" label="Una persona más" onClick={() => paso(1)} disabled={disabled} />
      </div>
    </div>
  );
}

function Paso({ icon, label, onClick, disabled }: {
  icon: 'plus' | 'minus'; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="press"
      style={{
        display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
        border: '1px solid var(--u-hair-2)', background: 'none', color: 'var(--u-text-2)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

/* ── A quién le toca ───────────────────────────────────────────
   El reparto del salón, que es la razón por la que esta pantalla no es
   la misma que «Tomar pedidos». Sin personal dado de alta no se enseña:
   un desplegable con una sola opción vacía no es una función, es un
   estorbo. */
function Mesero({ value, waiters, onChange, disabled, hint }: {
  value: string;
  waiters: WaiterOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  hint?: string | null;
}) {
  if (waiters.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--u-text-2)' }}>Atiende</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Mesero que atiende la mesa"
          style={{
            height: 34, minWidth: 140, maxWidth: 190, borderRadius: 10, padding: '0 8px',
            border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
            color: 'var(--u-text)', fontSize: 13.5, cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {/* Chrome en Windows pinta el `option` con el color del sistema si
              no se le dice el suyo (ver feedback-ui-contrast-bugs). */}
          <option value="" style={{ color: 'var(--u-text)' }}>Sin asignar</option>
          {waiters.map((w) => (
            <option key={w.id} value={w.id} style={{ color: 'var(--u-text)' }}>{w.name}</option>
          ))}
        </select>
      </div>
      {hint && (
        <span style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.4 }}>{hint}</span>
      )}
    </div>
  );
}

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 13, color: 'var(--u-text-3)' }}>
      <span>{label}</span>
      <span className="t-mono" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Secundario({ icon, label, onClick, disabled }: {
  icon: 'list' | 'plus' | 'x'; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        height: 40, borderRadius: 11, cursor: disabled ? 'default' : 'pointer',
        border: '1px solid var(--u-hair-2)', background: 'none',
        color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500, opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
