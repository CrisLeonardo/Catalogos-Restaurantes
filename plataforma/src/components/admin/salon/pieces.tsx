'use client';

/* Las piezas del salón: la ficha, la fila y el pin del plano.
   ------------------------------------------------------------------
   Las tres dibujan LA MISMA mesa con distinto nivel de detalle, así
   que viven juntas: si el criterio de color, el orden de los datos o
   la acción que se ofrece cambiaran en una sola de ellas, el salón
   contaría tres historias distintas del mismo local.

   Ninguna decide nada: reciben el estado ya resuelto por
   `lib/table-state.ts` y lo pintan. La regla sigue siendo la misma —
   el color no describe, avisa: solo la mesa que necesita a alguien
   lleva acento, y la libre se dibuja callada. */

import { Icon } from '@/components/icons';
import { fmtMin, type TableState, type TableStage, type TableAction } from '@/lib/table-state';
import type { TableOccupancy } from '@/lib/db/orders';
import type { OrderStatus } from '@/types';

/** Lo que las tres piezas necesitan saber de una mesa. */
export interface SalonTable {
  n: number;
  state: TableState;
  stage: TableStage;
  occ: TableOccupancy | undefined;
  action: TableAction;
  /** Ya formateado por quien pinta (símbolo y separadores del país). */
  total: string | null;
  /** Monto abreviado para el plano: «Q412», «Q1.2k». */
  totalCorto: string | null;
  /** «4 pers» — personas sentadas, o sillas de la mesa si está libre. */
  pax: string | null;
  /** Cuánto lleva la etapa actual, ya en texto. */
  tiempo: string | null;
}

/* ── Cómo se lee el estado en una ficha ────────────────────────
   La ficha ya enseña el reloj en su propia fila (la etapa), así que
   aquí el estado va SIN tiempo: «En cocina», no «En cocina · 9 min».
   Repetir el minuto en dos renglones seguidos no informa, ocupa. */
const ESTADO_CORTO: Partial<Record<OrderStatus, string>> = {
  NEW: 'Pedido tomado',
  PREP: 'En cocina',
  READY: 'Lista',
  TRANSIT: 'En camino',
  SERVED: 'Servida',
};

export function estadoDeFicha(t: SalonTable): string {
  if (t.state.kind === 'libre') return 'Libre';
  if (t.state.kind === 'atencion') return t.state.label;
  const occ = t.occ;
  if (!occ) return t.state.label;
  if (occ.status === 'NEW') return occ.itemCount === 1 ? '1 plato' : `${occ.itemCount} platos`;
  return ESTADO_CORTO[occ.status] ?? t.state.short;
}

/** El color del texto de estado. Solo la mesa que pide algo lleva acento. */
export function estadoInk(t: SalonTable): string {
  if (t.state.kind === 'atencion') return 'var(--brand-accent-ink)';
  if (t.state.kind === 'libre') return 'var(--u-text-4)';
  return 'var(--u-text-3)';
}

/** Cuánto tiempo lleva la etapa en curso, listo para pintar. */
export function tiempoDeEtapa(stage: TableStage, now: number | null): string | null {
  if (!stage.since || now == null) return null;
  const t = new Date(stage.since).getTime();
  if (!Number.isFinite(t)) return null;
  return fmtMin((now - t) / 60000);
}

/* ── Progreso de la comida ─────────────────────────────────────
   Cuatro tramos: Pedido tomado → En cocina → Servida → Por cobrar.
   Lo cumplido queda en tinta apagada, el paso actual en tinta plena
   (o en acento si la mesa pide algo) y lo que falta, casi invisible. */
export function StageBars({ stage, urgente }: { stage: TableStage; urgente: boolean }) {
  const vacio = 'color-mix(in srgb, var(--u-text) 8%, transparent)';
  return (
    <div className="salon-steps" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            background:
              stage.index < 0 ? vacio
                : i < stage.index ? 'color-mix(in srgb, var(--u-text) 30%, transparent)'
                : i === stage.index ? (urgente ? 'var(--brand-accent)' : 'var(--u-text)')
                : vacio,
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LA FICHA
   ------------------------------------------------------------
   Número, personas, monto, estado, en qué va la comida, cuánto
   lleva, quién atiende y UNA acción. Todo lo que antes había que
   adivinar de un cuadrito de 86 px con tres palabras.
   ════════════════════════════════════════════════════════════ */
export function TableCard({
  t, onOpen, onAction, disabled, busy,
}: {
  t: SalonTable;
  /** Tocar la ficha (no el botón) abre la mesa al lado / en la hoja. */
  onOpen: () => void;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const urgente = t.state.kind === 'atencion';
  const libre = t.state.kind === 'libre';
  const num = (size: number, width?: number) => ({
    fontSize: size, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
    width, flexShrink: 0,
    color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
  } as const);

  return (
    <div className="salon-card" data-kind={t.state.kind}>
      {/* El bloque de datos es un botón de verdad: abre la mesa. El de
          acción va aparte para no anidar botones (HTML inválido, y en
          la práctica un toque que dispara las dos cosas).

          Dos maquetas, una sola verdad: en PC la ficha cuenta la mesa
          entera (etapa de la comida incluida); en el teléfono se
          comprime a un renglón —número, qué pasa, quién atiende y
          cuánto—, porque catorce fichas de 250 px son cuatro pantallas
          de scroll para mirar un salón. */}
      <button
        type="button"
        onClick={onOpen}
        className="press salon-card-open"
        aria-label={`Mesa ${t.n} · ${t.state.label}`}
      >
        <span className="salon-card-full">
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span className="t-mono" style={num(24)}>{t.n}</span>
                {t.pax && <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>{t.pax}</span>}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, marginTop: 5, fontWeight: 600, color: estadoInk(t) }}>
                {estadoDeFicha(t)}
              </span>
            </span>
            <span
              className="t-mono"
              style={{
                fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0,
                color: libre ? 'var(--u-text-4)' : 'var(--u-text-2)',
              }}
            >
              {t.total ?? '—'}
            </span>
          </span>

          <StageBars stage={t.stage} urgente={urgente} />

          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--u-text-3)' }}>
            <span>{t.stage.label}</span>
            {t.tiempo && <span className="t-mono" style={{ fontWeight: 600 }}>{t.tiempo}</span>}
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--u-text-3)' }}>
            <Icon name="user" size={13} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.occ?.waiterName ?? 'Sin asignar'}
            </span>
          </span>
        </span>

        <span className="salon-card-compact">
          <span className="t-mono" style={num(26, 34)}>{t.n}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: estadoInk(t) }}>
              {estadoDeFicha(t)}
            </span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>
              {[t.pax, libre ? null : (t.occ?.waiterName ?? 'Sin asignar'), t.tiempo].filter(Boolean).join(' · ') || 'Sin abrir'}
            </span>
          </span>
          <span
            className="t-mono"
            style={{
              fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0,
              color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
            }}
          >
            {t.total ?? '—'}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="salon-act press"
        data-primary={urgente ? '1' : '0'}
        onClick={onAction}
        disabled={disabled || busy}
      >
        {busy ? 'Un momento…' : t.action.label}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LA FILA (vista Lista)
   ------------------------------------------------------------
   El mismo salón para quien prefiere leerlo de corrido: catorce
   renglones que caben de una vez, con el monto alineado por la
   coma para poder compararlos de un vistazo.
   ════════════════════════════════════════════════════════════ */
export function TableRow({
  t, onOpen, onAction, disabled, busy, primera,
}: {
  t: SalonTable;
  onOpen: () => void;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
  primera: boolean;
}) {
  const urgente = t.state.kind === 'atencion';
  const libre = t.state.kind === 'libre';
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', minHeight: 58,
        borderTop: primera ? 'none' : '1px solid var(--u-hair)',
        background: urgente ? 'color-mix(in srgb, var(--brand-accent) 5%, transparent)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="press"
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12,
          border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit',
        }}
      >
        <span
          className="t-mono"
          style={{
            width: 34, flexShrink: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {t.n}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: estadoInk(t) }}>
            {estadoDeFicha(t)}
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
            {[t.pax, t.occ?.waiterName ?? (libre ? null : 'Sin asignar'), t.tiempo && `${t.stage.label} · ${t.tiempo}`]
              .filter(Boolean).join(' · ') || 'Sin abrir'}
          </span>
        </span>
        <span
          className="t-mono"
          style={{
            flexShrink: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em',
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {t.total ?? '—'}
        </span>
      </button>
      <button
        type="button"
        className="salon-act press"
        data-primary={urgente ? '1' : '0'}
        onClick={onAction}
        disabled={disabled || busy}
        style={{ marginTop: 0, width: 'auto', minWidth: 132, padding: '0 14px', flexShrink: 0 }}
      >
        {busy ? 'Un momento…' : t.action.label}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EL PIN DEL PLANO
   ------------------------------------------------------------
   Ya no es un círculo con un número. Lleva número, personas, monto,
   estado y mesero: el plano deja de ser un mapa mudo y pasa a ser
   la misma información del salón, colocada como está el local.
   ════════════════════════════════════════════════════════════ */
export function TablePin({
  t, x, y, selected, onSelect,
}: {
  t: SalonTable;
  /** 0..1 dentro del lienzo. */
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const libre = t.state.kind === 'libre';
  return (
    <button
      type="button"
      className="salon-pin press"
      data-kind={t.state.kind}
      data-sel={selected ? '1' : '0'}
      onClick={onSelect}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      aria-label={`Mesa ${t.n} · ${t.state.label}`}
      aria-current={selected ? 'true' : undefined}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          className="t-mono"
          style={{
            fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
            color: libre ? 'var(--u-text-4)' : 'var(--u-text)',
          }}
        >
          {t.n}
        </span>
        {/* `nowrap` en los dos: a 100 px de ancho, «4 pers» partido en dos
            renglones descuadra el pin entero. */}
        {t.pax && <span style={{ fontSize: 11, color: 'var(--u-text-4)', whiteSpace: 'nowrap' }}>{t.pax}</span>}
        <span style={{ flex: 1 }} />
        {t.totalCorto && (
          <span className="t-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--u-text-2)', whiteSpace: 'nowrap' }}>
            {t.totalCorto}
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 600, color: estadoInk(t) }}>
        {t.state.short}
      </span>
      {/* En una mesa libre no hay mesero que nombrar, y repetir «Libre»
          debajo de «Libre» no informa de nada. */}
      {!libre && (
        <span style={{ fontSize: 10.5, color: 'var(--u-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.occ?.waiterName ?? 'Sin asignar'}
        </span>
      )}
    </button>
  );
}
