'use client';

/* Cuenta de mesa / dividir cuenta — pantalla completa del panel de mesero.

   Vivía dentro de waiter-panel.tsx y se volvió la parte más confusa del panel:
   arrancaba siempre en modo "dividir", los platos empezaban asignados a TODOS
   (así que tocar uno se lo QUITABA a la persona activa en vez de dárselo), no
   había forma de ver qué faltaba por repartir ni de llevar el control de quién
   ya pagó, y todo el trabajo se perdía al salir a agregar un plato.

   Rehecha alrededor de cómo se cobra de verdad en un restaurante:

     1. Casi siempre la mesa paga junta      → 'single' es el modo por defecto.
     2. A veces "entre todos"                → 'equal': solo el número de
                                                personas, sin nombres ni tocar
                                                platos.
     3. De vez en cuando "cada quien lo suyo"→ 'byItem': tocar a la persona y
                                                luego SUS platos; lo que nadie
                                                reclama se ve en su renglón.

   Además: desglose visible (consumo/propina/descuento), marcar quién ya pagó
   con el "falta cobrar" siempre a la vista, impresión del ticket de cada quien
   y todo el reparto guardado por mesa (salir a tomar otro pedido ya no borra
   el trabajo). */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import {
  buildBillLines, computeSplit, countUnassignedLines, UNASSIGNED_ID,
  type BillAssignment, type BillLine, type SplitMode,
} from '@/lib/bill-split';
import { printTableBillShare } from '@/lib/actions/orders';
import type { OrderWithItems } from '@/lib/db/orders';
import type { OrderStatus } from '@/types';
import type { PanelCurrency } from '@/components/admin/order-card';

export interface VoidTarget {
  orderId: string;
  orderStatus: OrderStatus;
  item: { id: string; name: string; remainingQty: number };
}

interface Props {
  restaurantId: string;
  tableNumber: number;
  orders: OrderWithItems[];
  currency: PanelCurrency;
  freeing: boolean;
  onVoidItem: (target: VoidTarget) => void;
  onFreeTable: () => void;
}

/* ── Estado persistido por mesa ───────────────────────────── */

interface SavedSplit {
  mode: SplitMode;
  peopleIds: string[];
  names: Record<string, string>;
  assignment: BillAssignment;
  paid: string[];
}

const EMPTY: SavedSplit = { mode: 'single', peopleIds: ['1', '2'], names: {}, assignment: {}, paid: [] };

function storageKey(restaurantId: string, tableNumber: number) {
  return `leogin-bill-${restaurantId}-${tableNumber}`;
}

function loadSaved(restaurantId: string, tableNumber: number): SavedSplit {
  try {
    const raw = localStorage.getItem(storageKey(restaurantId, tableNumber));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SavedSplit>;
    return {
      mode: parsed.mode === 'equal' || parsed.mode === 'byItem' ? parsed.mode : 'single',
      peopleIds: Array.isArray(parsed.peopleIds) && parsed.peopleIds.length > 0 ? parsed.peopleIds : EMPTY.peopleIds,
      names: parsed.names ?? {},
      assignment: parsed.assignment ?? {},
      paid: Array.isArray(parsed.paid) ? parsed.paid : [],
    };
  } catch {
    return EMPTY;
  }
}

/** Borra el reparto guardado de una mesa (al liberarla ya no aplica a nadie). */
export function clearSavedSplit(restaurantId: string, tableNumber: number) {
  try { localStorage.removeItem(storageKey(restaurantId, tableNumber)); } catch { /* modo privado */ }
}

/* ── Utilidades de presentación ───────────────────────────── */

function money(n: number, c: PanelCurrency): string {
  let num: string;
  try {
    num = n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    num = n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}

/* El rótulo de cada bloque de la cuenta.
   ------------------------------------------------------------------
   Era Anton-style: 11 px, negrita 700, MAYÚSCULAS y 0.05em de espaciado.
   Funcionaba cuando esto era una pantalla aparte; desde que la cuenta
   vive DENTRO del panel derecho (rediseño 2026-08-26), quedaba al lado
   de los rótulos del resto —12,5 px, peso 600, sin mayúsculas— y se
   notaban las dos épocas en la misma pantalla.

   Es lo único que se le tocó a la cuenta: el reparto por persona y por
   platos está probado y no se reescribe, solo cambió de sitio. */
const KICKER: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: 0, marginBottom: 8,
};

const MODE_TABS: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'single', label: 'Una sola cuenta', hint: 'La mesa paga junta. Imprime la cuenta y listo.' },
  { id: 'equal', label: 'Partes iguales', hint: 'Solo dime entre cuántas personas: el total se parte parejo.' },
  { id: 'byItem', label: 'Cada quien lo suyo', hint: 'Toca a una persona y luego SUS platos. Un plato se puede compartir tocándolo con varias.' },
];

/* ── Componente ───────────────────────────────────────────── */

export default function WaiterBill({
  restaurantId, tableNumber, orders, currency, freeing, onVoidItem, onFreeTable,
}: Props) {
  const [mode, setMode] = useState<SplitMode>('single');
  const [peopleIds, setPeopleIds] = useState<string[]>(['1', '2']);
  const [names, setNames] = useState<Record<string, string>>({});
  const [assignment, setAssignment] = useState<BillAssignment>({});
  const [paid, setPaid] = useState<string[]>([]);
  const [activePerson, setActivePerson] = useState<string>('1');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [printing, startPrint] = useTransition();
  const [printMsg, setPrintMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Rehidrata el reparto de ESTA mesa. Sin esto, salir a agregar un plato y
  // volver borraba nombres y asignaciones — la queja número uno del flujo.
  useEffect(() => {
    const saved = loadSaved(restaurantId, tableNumber);
    setMode(saved.mode);
    setPeopleIds(saved.peopleIds);
    setNames(saved.names);
    setAssignment(saved.assignment);
    setPaid(saved.paid);
    setActivePerson(saved.peopleIds[0] ?? '1');
    setHydrated(true);
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey(restaurantId, tableNumber),
        JSON.stringify({ mode, peopleIds, names, assignment, paid } satisfies SavedSplit),
      );
    } catch { /* modo privado / sin cuota: el reparto sigue vivo en memoria */ }
  }, [hydrated, restaurantId, tableNumber, mode, peopleIds, names, assignment, paid]);

  const lines = useMemo(() => buildBillLines(orders), [orders]);
  const liveLines = useMemo(() => lines.filter((l) => l.quantity > 0), [lines]);
  const voidedLines = useMemo(() => lines.filter((l) => l.quantity === 0), [lines]);

  const split = useMemo(
    () => computeSplit({ orders, mode, peopleIds, assignment }),
    [orders, mode, peopleIds, assignment],
  );
  const { breakdown } = split;

  const safeActive = peopleIds.includes(activePerson) ? activePerson : (peopleIds[0] ?? '1');
  const unassignedCount = useMemo(
    () => countUnassignedLines(lines, assignment, peopleIds),
    [lines, assignment, peopleIds],
  );

  const label = useCallback(
    (id: string) => (id === UNASSIGNED_ID ? 'Sin asignar' : (names[id]?.trim() || `Persona ${id}`)),
    [names],
  );

  /* ── Personas ──────────────────────────────────────────── */

  function addPerson() {
    const next = String(Math.max(0, ...peopleIds.map((p) => Number(p) || 0)) + 1);
    setPeopleIds((prev) => [...prev, next]);
    setActivePerson(next);
  }

  function removePerson(id: string) {
    if (peopleIds.length <= 1) return;
    const rest = peopleIds.filter((p) => p !== id);
    setPeopleIds(rest);
    // Los platos que SOLO tenía esta persona vuelven a "sin asignar" en vez de
    // desaparecer del mapa (antes se borraba la clave y el plato se convertía
    // en "de todos" sin avisar, descuadrando el cobro en silencio).
    setAssignment((prev) => {
      const next: BillAssignment = {};
      for (const [itemId, ids] of Object.entries(prev)) next[itemId] = ids.filter((p) => p !== id);
      return next;
    });
    setNames((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev }; delete next[id]; return next;
    });
    setPaid((prev) => prev.filter((p) => p !== id));
    if (activePerson === id) setActivePerson(rest[0]);
  }

  function setPeopleCount(n: number) {
    const count = Math.max(1, Math.min(30, n));
    setPeopleIds((prev) => {
      if (count === prev.length) return prev;
      if (count < prev.length) return prev.slice(0, count);
      const next = [...prev];
      let seed = Math.max(0, ...prev.map((p) => Number(p) || 0));
      while (next.length < count) next.push(String(++seed));
      return next;
    });
  }

  function commitRename(id: string) {
    const trimmed = draftName.trim();
    setNames((prev) => {
      if (!trimmed) {
        if (!(id in prev)) return prev;
        const next = { ...prev }; delete next[id]; return next;
      }
      return { ...prev, [id]: trimmed.slice(0, 24) };
    });
    setRenaming(null);
  }

  /** Tocar un plato lo asigna a la persona activa; tocarlo de nuevo se lo
   *  quita. Si ya lo tiene otra persona, se suma → el plato queda compartido
   *  y su precio se parte entre quienes lo tengan. */
  function toggleLine(itemId: string) {
    setAssignment((prev) => {
      const current = (prev[itemId] ?? []).filter((id) => peopleIds.includes(id));
      const has = current.includes(safeActive);
      return {
        ...prev,
        [itemId]: has ? current.filter((id) => id !== safeActive) : [...current, safeActive],
      };
    });
  }

  function assignRestTo(personId: string) {
    setAssignment((prev) => {
      const next = { ...prev };
      for (const l of liveLines) {
        const claimed = (next[l.itemId] ?? []).filter((id) => peopleIds.includes(id));
        if (claimed.length === 0) next[l.itemId] = [personId];
      }
      return next;
    });
  }

  function togglePaid(id: string) {
    setPaid((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  /* ── Impresión ─────────────────────────────────────────── */

  function print(personId: string | null) {
    setPrintMsg(null);
    startPrint(async () => {
      const res = await printTableBillShare({
        restaurantId, tableNumber, mode, peopleIds, names, assignment, personId,
      });
      setPrintMsg(res.error
        ? { text: res.error, bad: true }
        : { text: personId === null ? '✓ Cuenta enviada a la impresora' : `✓ Ticket de ${label(personId)} enviado`, bad: false });
    });
  }

  /* ── Cobro ─────────────────────────────────────────────── */

  const shares = mode === 'single'
    ? [{ personId: 'mesa', items: breakdown.items, extras: breakdown.extras, total: breakdown.grandTotal }]
    : split.people;
  const pendingTotal = shares
    .filter((s) => !paid.includes(s.personId))
    .reduce((sum, s) => sum + s.total, 0)
    + (split.unassigned?.total ?? 0);
  const allPaid = pendingTotal <= 0.004 && shares.length > 0;

  if (orders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--u-text-4)' }}>
        Esta mesa no tiene pedidos activos.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Total y desglose ─────────────────────────────── */}
      <div className="glass" style={{ borderRadius: 16, padding: '16px 16px 14px' }}>
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600 }}>Total de la mesa</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--u-text)', lineHeight: 1.1, marginTop: 2 }}>
          {money(breakdown.grandTotal, currency)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--u-hair)' }}>
          <Row label={`Consumo · ${liveLines.length} plato${liveLines.length === 1 ? '' : 's'}`} value={money(breakdown.items, currency)} />
          {breakdown.tip > 0 && <Row label="Propina" value={money(breakdown.tip, currency)} />}
          {breakdown.delivery > 0 && <Row label="Envío" value={money(breakdown.delivery, currency)} />}
          {breakdown.discount > 0 && <Row label="Descuento" value={`−${money(breakdown.discount, currency)}`} accent />}
          {breakdown.orderCount > 1 && (
            <Row label={`${breakdown.orderCount} rondas de pedidos`} value="" />
          )}
        </div>
      </div>

      {/* ── Modo de cobro ────────────────────────────────── */}
      <div>
        <div style={KICKER}>¿Cómo van a pagar?</div>
        <div style={{ display: 'flex', gap: 7 }}>
          {MODE_TABS.map((t) => {
            const on = mode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className="press"
                style={{
                  flex: 1, padding: '11px 6px', borderRadius: 12, cursor: 'pointer', lineHeight: 1.25,
                  border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                  background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                  color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                  fontSize: 12.5, fontWeight: 700,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8, lineHeight: 1.5 }}>
          {MODE_TABS.find((t) => t.id === mode)?.hint}
        </div>
      </div>

      {/* ── Partes iguales: solo el contador ─────────────── */}
      {mode === 'equal' && (
        <div className="glass" style={{ borderRadius: 16, padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', textAlign: 'center' }}>
            ¿Entre cuántas personas?
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 12 }}>
            <StepBtn label="−" onClick={() => setPeopleCount(peopleIds.length - 1)} disabled={peopleIds.length <= 1} />
            <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--u-text)', minWidth: 62, textAlign: 'center', lineHeight: 1 }}>
              {peopleIds.length}
            </span>
            <StepBtn label="+" onClick={() => setPeopleCount(peopleIds.length + 1)} disabled={peopleIds.length >= 30} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--u-hair)' }}>
            <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>Le toca a cada quien</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-accent-ink)', letterSpacing: '-0.02em' }}>
              {money(split.people[0]?.total ?? 0, currency)}
            </div>
          </div>
        </div>
      )}

      {/* ── Cada quien lo suyo: personas + platos ────────── */}
      {mode === 'byItem' && (
        <>
          <div>
            <div style={KICKER}>Personas · toca una para asignarle platos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {peopleIds.map((id) => {
                const on = safeActive === id;
                return (
                  <span
                    key={id}
                    onClick={() => setActivePerson(id)}
                    className="press"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 8px 8px 13px', borderRadius: 99,
                      background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--brand-accent) 13%, transparent)',
                      color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text)',
                      border: `1px solid ${on ? 'var(--brand-accent)' : 'transparent'}`,
                      fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {renaming === id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(id);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={() => commitRename(id)}
                        placeholder={`Persona ${id}`}
                        style={{ width: 82, background: 'transparent', border: 'none', borderBottom: '1px solid currentColor', color: 'inherit', fontSize: 13.5, fontWeight: 600, outline: 'none', padding: 0 }}
                      />
                    ) : (
                      // El nombre NO tiene onClick propio: el toque cae al span
                      // exterior y selecciona a la persona. Editar es aparte
                      // (botón lápiz), igual que quitar es aparte (botón X) —
                      // antes el nombre absorbía casi todo el chip y tocar
                      // "seleccionar" terminaba abriendo la edición.
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {label(id)}
                      </span>
                    )}
                    {renaming !== id && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDraftName(names[id] ?? ''); setRenaming(id); }}
                        aria-label={`Editar nombre de ${label(id)}`}
                        className="press"
                        style={{ width: 20, height: 20, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,0.15)', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                      >
                        <Icon name="edit" size={11} />
                      </button>
                    )}
                    {peopleIds.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removePerson(id); }}
                        aria-label={`Quitar ${label(id)}`}
                        className="press"
                        style={{ width: 20, height: 20, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,0.15)', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
              <button type="button" onClick={addPerson} className="press glass-quiet" style={{ padding: '8px 16px', borderRadius: 99, border: '1px dashed var(--u-hair)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                + Persona
              </button>
            </div>
          </div>

          {unassignedCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              borderRadius: 12, padding: '10px 13px',
              background: 'color-mix(in srgb, var(--c-warn, #f59e0b) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 28%, transparent)',
            }}>
              <Icon name="alertCircle" size={15} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 170, fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
                <b>{unassignedCount} plato{unassignedCount === 1 ? '' : 's'} sin asignar</b> ·{' '}
                {money(split.unassigned?.total ?? 0, currency)} que nadie está pagando.
              </span>
              <button
                type="button"
                onClick={() => assignRestTo(safeActive)}
                className="press"
                style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 99, border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 40%, transparent)', background: 'transparent', color: 'var(--c-warn)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                Dárselos a {label(safeActive)}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Platos ───────────────────────────────────────── */}
      <div>
        <div style={KICKER}>
          {mode === 'byItem' ? `Platos · tocando asignas a ${label(safeActive)}` : 'Platos de la mesa'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {liveLines.map((line) => (
            <LineCard
              key={line.itemId}
              line={line}
              currency={currency}
              interactive={mode === 'byItem'}
              claimedBy={(assignment[line.itemId] ?? []).filter((id) => peopleIds.includes(id))}
              activeId={safeActive}
              labelOf={label}
              onTap={() => toggleLine(line.itemId)}
              onVoid={() => onVoidItem({
                orderId: line.orderId,
                orderStatus: line.orderStatus,
                item: { id: line.itemId, name: line.name, remainingQty: line.quantity },
              })}
            />
          ))}
          {voidedLines.map((line) => (
            <div key={line.itemId} className="glass" style={{ borderRadius: 12, padding: '9px 12px', opacity: 0.45 }}>
              <div style={{ fontSize: 13, color: 'var(--u-text-3)', textDecoration: 'line-through' }}>
                {line.voidedQuantity}× {line.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-danger)', fontWeight: 600, marginTop: 2 }}>Anulado · no se cobra</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cobro ────────────────────────────────────────── */}
      <div>
        <div style={KICKER}>Cobro</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shares.map((s, i) => {
            const isPaid = paid.includes(s.personId);
            const name = mode === 'single' ? 'Cuenta completa' : label(s.personId);
            return (
              <div
                key={s.personId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
                  background: isPaid ? 'color-mix(in srgb, var(--c-ok, #4ade80) 9%, transparent)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                  border: `1px solid ${isPaid ? 'color-mix(in srgb, var(--c-ok, #4ade80) 28%, transparent)' : 'transparent'}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => togglePaid(s.personId)}
                  aria-label={isPaid ? `Marcar ${name} como no cobrado` : `Marcar ${name} como cobrado`}
                  className="press"
                  style={{
                    width: 26, height: 26, flexShrink: 0, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center',
                    border: `1px solid ${isPaid ? 'var(--c-ok, #4ade80)' : 'var(--u-hair)'}`,
                    background: isPaid ? 'var(--c-ok, #4ade80)' : 'transparent',
                    color: isPaid ? '#0b0b0c' : 'var(--u-text-4)',
                  }}
                >
                  {isPaid && <Icon name="check" size={14} strokeWidth={3} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', textDecoration: isPaid ? 'line-through' : 'none' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
                    {isPaid ? 'Cobrado' : mode === 'single'
                      ? 'Toda la mesa'
                      : mode === 'byItem'
                        ? `Consumo ${money(s.items, currency)}${s.extras !== 0 ? ` + ${money(s.extras, currency)}` : ''}`
                        : `Parte ${i + 1} de ${shares.length}`}
                  </div>
                </div>
                <span style={{ fontSize: 17, fontWeight: 800, color: isPaid ? 'var(--u-text-3)' : 'var(--u-text)', flexShrink: 0 }}>
                  {money(s.total, currency)}
                </span>
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => print(mode === 'single' ? null : s.personId)}
                  aria-label={`Imprimir ticket de ${name}`}
                  title="Imprimir este ticket"
                  className="press glass-quiet"
                  style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: 'none', cursor: printing ? 'wait' : 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', opacity: printing ? 0.5 : 1 }}
                >
                  <Icon name="print" size={15} />
                </button>
              </div>
            );
          })}

          {split.unassigned && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '1px dashed color-mix(in srgb, var(--c-warn, #f59e0b) 40%, transparent)' }}>
              <Icon name="alertCircle" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)' }}>Sin asignar</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-warn)' }}>
                {money(split.unassigned.total, currency)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--u-hair)', marginTop: 2 }}>
            <span style={{ fontSize: 13, color: allPaid ? 'var(--c-ok, #4ade80)' : 'var(--u-text-3)', fontWeight: allPaid ? 700 : 400 }}>
              {allPaid ? '✓ Todo cobrado' : 'Falta cobrar'}
            </span>
            {!allPaid && (
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--u-text)' }}>{money(pendingTotal, currency)}</span>
            )}
          </div>
        </div>
      </div>

      {printMsg && (
        <div style={{
          fontSize: 12.5, lineHeight: 1.5, padding: '9px 12px', borderRadius: 10,
          color: printMsg.bad ? 'var(--c-danger, #f87171)' : 'var(--c-ok, #4ade80)',
          background: printMsg.bad ? 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)' : 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)',
        }}>
          {printMsg.text}
        </div>
      )}

      {/* ── Acciones ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          disabled={printing}
          onClick={() => print(null)}
          className="press glass-quiet"
          style={{ padding: '13px', borderRadius: 14, border: 'none', cursor: printing ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)', opacity: printing ? 0.6 : 1 }}
        >
          <Icon name="print" size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 7 }} />
          {printing ? 'Enviando…' : 'Imprimir la cuenta completa'}
        </button>
        <button
          type="button"
          disabled={freeing}
          onClick={onFreeTable}
          className={allPaid ? 'press btn-accent' : 'press'}
          style={allPaid
            ? { padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: freeing ? 0.6 : 1 }
            : { padding: '14px', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: freeing ? 0.6 : 1, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 30%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 8%, transparent)', color: 'var(--c-danger)' }}
        >
          {freeing ? 'Liberando…' : (
            <>
              <Icon name="check" size={15} strokeWidth={2.6} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              {allPaid ? 'Cobrada — liberar la mesa' : 'Marcar mesa como libre'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Piezas ───────────────────────────────────────────────── */

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
      <span style={{ color: 'var(--u-text-3)' }}>{label}</span>
      <span style={{ color: accent ? 'var(--c-ok, #4ade80)' : 'var(--u-text-2)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '+' ? 'Una persona más' : 'Una persona menos'}
      className="press glass-quiet"
      style={{
        width: 52, height: 52, borderRadius: 16, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 600, color: 'var(--u-text)', opacity: disabled ? 0.35 : 1,
      }}
    >
      {label}
    </button>
  );
}

function LineCard({
  line, currency, interactive, claimedBy, activeId, labelOf, onTap, onVoid,
}: {
  line: BillLine;
  currency: PanelCurrency;
  interactive: boolean;
  claimedBy: string[];
  activeId: string;
  labelOf: (id: string) => string;
  onTap: () => void;
  onVoid: () => void;
}) {
  const mine = interactive && claimedBy.includes(activeId);
  const shared = claimedBy.length > 1;

  return (
    <div
      onClick={interactive ? onTap : undefined}
      className={interactive ? 'glass press' : 'glass'}
      style={{
        borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: interactive ? 'pointer' : 'default',
        border: `1px solid ${mine ? 'var(--brand-accent)' : 'transparent'}`,
        background: mine ? 'color-mix(in srgb, var(--brand-accent) 8%, transparent)' : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>
          {line.quantity}× {line.name}
        </div>
        {line.options && (
          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>{line.options}</div>
        )}
        {line.voidedQuantity > 0 && (
          <div style={{ fontSize: 11, color: 'var(--c-danger)', fontWeight: 600, marginTop: 2 }}>
            {line.voidedQuantity} anulada{line.voidedQuantity === 1 ? '' : 's'}
          </div>
        )}
        {interactive && (
          <div style={{
            fontSize: 11.5, marginTop: 3, fontWeight: claimedBy.length === 0 ? 700 : 600,
            color: claimedBy.length === 0 ? 'var(--c-warn, #f59e0b)' : 'var(--brand-accent)',
          }}>
            {claimedBy.length === 0
              ? 'Sin asignar'
              : shared
                ? `Compartido: ${claimedBy.map(labelOf).join(', ')}`
                : `De ${labelOf(claimedBy[0])}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
          {money(line.lineTotal, currency)}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onVoid(); }}
          title="Anular este plato"
          aria-label={`Anular ${line.name}`}
          className="press"
          style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--c-danger-line)', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="x" size={11} />
        </button>
        {interactive && (
          <span style={{
            width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center',
            border: `1px solid ${mine ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
            background: mine ? 'var(--brand-accent)' : 'transparent',
            color: 'var(--brand-on-accent, #fff)',
          }}>
            {mine && <Icon name="check" size={13} strokeWidth={3} />}
          </span>
        )}
      </div>
    </div>
  );
}
