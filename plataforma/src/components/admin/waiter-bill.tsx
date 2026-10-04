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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import DiscountDialog from '@/components/admin/waiter/discount-dialog';
import { Group, Hr, Mono, Seg } from '@/components/admin/waiter/pieces';
import {
  buildBillLines, computeSplit, countUnassignedLines, splitFromSeats, UNASSIGNED_ID,
  type BillAssignment, type BillLine, type SplitMode,
} from '@/lib/bill-split';
import { printTableBillShare, getTableSplit, saveTableSplit } from '@/lib/actions/orders';
import CloseTableSheet from '@/components/admin/waiter/close-table-sheet';
import type { PaymentMethod } from '@/lib/payment-method';
import type { OrderWithItems } from '@/lib/db/orders';
import type { OrderStatus } from '@/types';
import type { PanelCurrency } from '@/components/admin/order-card';
import { fmtCurrency } from '@/lib/money';

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
  /** Se acaba de aplicar (o quitar) un descuento: hay que recargar la
      cuenta desde el servidor o el total de pantalla sería el viejo. */
  onDiscountApplied: () => void;
  /** Cierra la mesa. Recibe cómo se pagó: sin eso, el arqueo de caja
      cuenta como efectivo hasta lo que se pagó con tarjeta. */
  onFreeTable: (pagos: { method: PaymentMethod; amount?: number | null; cashReceived?: number | null }[]) => void;
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

/** Borra el reparto guardado de una mesa (al liberarla ya no aplica a nadie).
    El del servidor lo borra `freeTable`; este es el de este aparato. */
export function clearSavedSplit(restaurantId: string, tableNumber: number) {
  try { localStorage.removeItem(storageKey(restaurantId, tableNumber)); } catch { /* modo privado */ }
}

/** ¿Alguien tocó ya este reparto, o es el que viene de fábrica? */
function tieneReparto(s: SavedSplit): boolean {
  return s.mode !== 'single'
    || s.paid.length > 0
    || Object.keys(s.names).length > 0
    || Object.values(s.assignment).some((ids) => ids.length > 0);
}

/** Envuelve el reparto por asientos (lib/bill-split.ts) en la forma que
    guarda esta pantalla. El modo NO se fuerza a 'byItem': la mayoría de
    las mesas pagan juntas y abrir el cobro ya partido en cuatro sería
    contestar una pregunta que nadie hizo. Lo que se gana es que, si se
    elige repartir, ya está repartido. */
function fromSeats(lines: BillLine[]): SavedSplit | null {
  const semilla = splitFromSeats(lines);
  if (!semilla) return null;
  return {
    mode: 'single',
    peopleIds: semilla.peopleIds.length > 0 ? semilla.peopleIds : EMPTY.peopleIds,
    names: {},
    assignment: semilla.assignment,
    paid: [],
  };
}

/* ── Utilidades de presentación ───────────────────────────── */

const money = (n: number, c: PanelCurrency): string => fmtCurrency(n, c);

/* El rótulo de cada bloque de la cuenta.
   ------------------------------------------------------------------
   Era Anton-style: 11 px, negrita 700, MAYÚSCULAS y 0.05em de espaciado.
   Funcionaba cuando esto era una pantalla aparte; desde que la cuenta
   vive DENTRO del panel derecho (rediseño 2026-08-26), quedaba al lado
   de los rótulos del resto —12,5 px, peso 600, sin mayúsculas— y se
   notaban las dos épocas en la misma pantalla.

   Es lo único que se le tocó a la cuenta: el reparto por persona y por
   platos está probado y no se reescribe, solo cambió de sitio. */
/* Cobrar es un MODO del panel derecho, no una pantalla aparte, así que
   habla el mismo idioma que la comanda de al lado: etiqueta de sección en
   versalitas (`.adm-label`), tarjeta con filas separadas por un pelo de
   línea, e importes en monoespaciada. Antes esta pantalla venía del diseño
   viejo —tarjetas `.glass`, totales de 34 px, píldoras de colores— y era lo
   que hacía que cobrar pareciese otra aplicación. */
const KICKER: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
  color: 'var(--u-text-3)', padding: '0 4px 8px',
};

const MODE_TABS: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'single', label: 'Una sola cuenta', hint: 'La mesa paga junta. Imprime la cuenta y listo.' },
  { id: 'equal', label: 'Partes iguales', hint: 'Solo dime entre cuántas personas: el total se parte parejo.' },
  { id: 'byItem', label: 'Cada quien lo suyo', hint: 'Toca a una persona y luego SUS platos. Un plato se puede compartir tocándolo con varias.' },
];

/* ── Componente ───────────────────────────────────────────── */

export default function WaiterBill({
  restaurantId, tableNumber, orders, currency, freeing, onVoidItem, onDiscountApplied, onFreeTable,
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
  /* La hoja de cierre: cómo pagó la mesa y el aviso de lo que queda sin
     cobrar. Cerrar una mesa dispara la facturación y no se deshace, así
     que ya no es un botón suelto. */
  const [closing, setClosing] = useState(false);
  /* El descuento de la mesa (M-10): invitar un postre por una queja, un
     10 % de cumpleaños. Lo firma un encargado, igual que anular. */
  const [descuentoAbierto, setDescuentoAbierto] = useState(false);

  const lines = useMemo(() => buildBillLines(orders), [orders]);
  const liveLines = useMemo(() => lines.filter((l) => l.quantity > 0), [lines]);
  const voidedLines = useMemo(() => lines.filter((l) => l.quantity === 0), [lines]);

  /* Las líneas, sin que su identidad reinicie la hidratación: el efecto de
     abajo corre UNA vez por mesa y solo las necesita para sembrar. */
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  /* ── De dónde sale el reparto al abrir la mesa ───────────────
     Tres fuentes, en este orden, y cada una solo entra si la anterior
     no tenía nada que decir:

       1. este aparato (localStorage) — pintado al instante, para que
          volver de agregar un plato no parpadee, y para que el cobro
          siga funcionando sin señal;
       2. el local (tabla `table_splits`, migración 125) — manda, porque
          es lo que ve todo el mundo: el mesero empieza en su teléfono y
          el cajero lo termina en la tablet;
       3. los asientos ya apuntados al pedir (`seat_no`, migración 123)
          — si nadie ha repartido todavía, el reparto YA ESTÁ HECHO
          desde que se tomó la comanda. Antes se tiraba y había que
          rehacerlo plato por plato con el cliente esperando. */
  useEffect(() => {
    let vivo = true;
    setHydrated(false);

    const local = loadSaved(restaurantId, tableNumber);
    const aplicar = (s: SavedSplit) => {
      setMode(s.mode);
      setPeopleIds(s.peopleIds);
      setNames(s.names);
      setAssignment(s.assignment);
      setPaid(s.paid);
      setActivePerson(s.peopleIds[0] ?? '1');
    };
    aplicar(local);

    getTableSplit(restaurantId, tableNumber).then((res) => {
      if (!vivo) return;
      if (!('error' in res) && res.split) {
        const s = res.split;
        aplicar({
          mode: s.mode,
          peopleIds: s.people.map((p) => p.id),
          names: Object.fromEntries(s.people.flatMap((p) => (p.name ? [[p.id, p.name]] : []))),
          assignment: s.assignment,
          paid: s.paid,
        });
      } else if (!tieneReparto(local)) {
        const sembrado = fromSeats(linesRef.current);
        if (sembrado) aplicar(sembrado);
      }
      setHydrated(true);
    }).catch(() => {
      /* Sin red se cobra igual con lo de este aparato: el reparto es
         trabajo en curso, no puede quedarse esperando al servidor. */
      if (vivo) setHydrated(true);
    });

    return () => { vivo = false; };
  }, [restaurantId, tableNumber]);

  /* Guardar: en el aparato al instante y en el local con freno. Cada
     toque de un plato es un cambio, y sin el freno serían veinte
     escrituras para repartir una mesa de cuatro. */
  useEffect(() => {
    if (!hydrated) return;
    const snapshot: SavedSplit = { mode, peopleIds, names, assignment, paid };
    try {
      localStorage.setItem(storageKey(restaurantId, tableNumber), JSON.stringify(snapshot));
    } catch { /* modo privado / sin cuota: el reparto sigue vivo en memoria */ }

    const t = setTimeout(() => {
      saveTableSplit(restaurantId, tableNumber, {
        mode,
        people: peopleIds.map((id) => (names[id] ? { id, name: names[id] } : { id })),
        assignment,
        paid,
      }).catch(() => { /* sin señal: queda guardado en el aparato */ });
    }, 700);
    return () => clearTimeout(t);
  }, [hydrated, restaurantId, tableNumber, mode, peopleIds, names, assignment, paid]);

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
      {/* ── Modo de cobro ────────────────────────────────── */}
      <div>
        <div style={KICKER}>¿Cómo van a pagar?</div>
        <Seg
          value={mode}
          onChange={setMode}
          ariaLabel="Cómo se reparte la cuenta"
          options={MODE_TABS.map((t) => ({ value: t.id, label: t.label }))}
        />
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 8, lineHeight: 1.5, padding: '0 4px' }}>
          {MODE_TABS.find((t) => t.id === mode)?.hint}
        </div>
      </div>

      {/* ── Partes iguales: solo el contador ─────────────── */}
      {mode === 'equal' && (
        <Group style={{ padding: 16 }}>
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
          <div style={{ textAlign: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--adm-border)' }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Le toca a cada quien</div>
            <div style={{ marginTop: 3 }}>
              <Mono size={26} color="var(--brand-accent-ink)">{money(split.people[0]?.total ?? 0, currency)}</Mono>
            </div>
          </div>
        </Group>
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
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 8px 8px 13px', borderRadius: 'var(--radius-full)',
                      background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--brand-accent) 13%, transparent)',
                      color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text)',
                      border: `1px solid ${on ? 'var(--brand-accent)' : 'transparent'}`,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
                        style={{ width: 82, background: 'transparent', border: 'none', borderBottom: '1px solid currentColor', color: 'inherit', fontSize: 13, fontWeight: 600, outline: 'none', padding: 0 }}
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
                        style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: 'none', background: 'rgba(0,0,0,0.15)', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
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
                        style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: 'none', background: 'rgba(0,0,0,0.15)', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
              <button type="button" onClick={addPerson} className="press glass-quiet" style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', border: '1px dashed var(--u-hair)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                + Persona
              </button>
            </div>
          </div>

          {unassignedCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              borderRadius: 'var(--radius-lg)', padding: '10px 13px',
              background: 'color-mix(in srgb, var(--c-warn, #f59e0b) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 28%, transparent)',
            }}>
              <Icon name="alertCircle" size={15} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 170, fontSize: 12, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
                <b>{unassignedCount} plato{unassignedCount === 1 ? '' : 's'} sin asignar</b> ·{' '}
                {money(split.unassigned?.total ?? 0, currency)} que nadie está pagando.
              </span>
              <button
                type="button"
                onClick={() => assignRestTo(safeActive)}
                className="press"
                style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 'var(--radius-full)', border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 40%, transparent)', background: 'transparent', color: 'var(--c-warn)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
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
        <Group>
          {liveLines.map((line, i) => (
            <LineCard
              key={line.itemId}
              primera={i === 0}
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
            <div key={line.itemId}>
              <Hr />
              <div style={{ padding: '10px 16px', opacity: 0.55 }}>
                <div style={{ fontSize: 13, color: 'var(--u-text-3)', textDecoration: 'line-through' }}>
                  {line.voidedQuantity} · {line.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-danger)', fontWeight: 600, marginTop: 1 }}>Anulado · no se cobra</div>
              </div>
            </div>
          ))}
        </Group>
      </div>

      {/* ── Cobro ────────────────────────────────────────── */}
      <div>
        <div style={KICKER}>Cobro</div>
        <Group>
          {shares.map((s, i) => {
            const isPaid = paid.includes(s.personId);
            const name = mode === 'single' ? 'Cuenta completa' : label(s.personId);
            return (
              <div key={s.personId}>
                {i > 0 && <Hr />}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px 11px 16px', minHeight: 52,
                  background: isPaid ? 'color-mix(in srgb, var(--c-ok) 8%, transparent)' : undefined,
                }}>
                  <button
                    type="button"
                    onClick={() => togglePaid(s.personId)}
                    aria-label={isPaid ? `Marcar ${name} como no cobrado` : `Marcar ${name} como cobrado`}
                    className="press"
                    style={{
                      width: 22, height: 22, flexShrink: 0, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'grid', placeItems: 'center',
                      border: isPaid ? 'none' : '1.5px solid var(--adm-border-2)',
                      background: isPaid ? 'var(--c-ok)' : 'transparent',
                      color: '#ffffff',
                    }}
                  >
                    {isPaid && <Icon name="check" size={13} strokeWidth={3} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--u-text)', textDecoration: isPaid ? 'line-through' : 'none' }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>
                      {isPaid ? 'Cobrado' : mode === 'single'
                        ? 'Toda la mesa'
                        : mode === 'byItem'
                          ? `Consumo ${money(s.items, currency)}${s.extras !== 0 ? ` + ${money(s.extras, currency)}` : ''}`
                          : `Parte ${i + 1} de ${shares.length}`}
                    </div>
                  </div>
                  <Mono size={15} color={isPaid ? 'var(--u-text-3)' : 'var(--u-text)'}>{money(s.total, currency)}</Mono>
                  <button
                    type="button"
                    disabled={printing}
                    onClick={() => print(mode === 'single' ? null : s.personId)}
                    aria-label={`Imprimir ticket de ${name}`}
                    title="Imprimir este ticket"
                    className="press"
                    style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 'var(--radius-md)', border: '1px solid var(--adm-border-2)', background: 'none', cursor: printing ? 'wait' : 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', opacity: printing ? 0.5 : 1 }}
                  >
                    <Icon name="print" size={15} />
                  </button>
                </div>
              </div>
            );
          })}

          {split.unassigned && (
            <>
              <Hr />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', minHeight: 44 }}>
                <Icon name="alertCircle" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--u-text-2)' }}>Sin asignar</span>
                <Mono size={15} color="var(--c-warn)">{money(split.unassigned.total, currency)}</Mono>
              </div>
            </>
          )}

          <Hr full />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
            background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
          }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: allPaid ? 'var(--c-ok)' : 'var(--u-text)' }}>
              {allPaid ? 'Todo cobrado' : 'Falta cobrar'}
            </span>
            {!allPaid && <Mono size={17}>{money(pendingTotal, currency)}</Mono>}
          </div>
        </Group>
      </div>

      {/* ── Lo que se cobra ──────────────────────────────
          En el lienzo el desglose va al FINAL, pegado al botón de cobrar,
          y no como un titular de 34 px arriba del todo. Es el orden en que
          se usa: primero se decide cómo se reparte y qué platos entran,
          y el número solo importa al final. */}
      <Group>
        <BillRow label={`Consumo · ${liveLines.length} plato${liveLines.length === 1 ? '' : 's'}`} value={money(breakdown.items, currency)} />
        {breakdown.tip > 0 && <><Hr /><BillRow label="Propina" value={money(breakdown.tip, currency)} /></>}
        {breakdown.delivery > 0 && <><Hr /><BillRow label="Envío" value={money(breakdown.delivery, currency)} /></>}
        {/* El descuento deja de ser un renglón que solo se LEE (M-10).
            Tocarlo abre quién firma, cuánto y por qué; y si no hay ninguno,
            la fila sigue estando para poder ponerlo — que era justo lo que
            faltaba: el número se pintaba y no había forma de crearlo. */}
        <Hr />
        <button
          type="button"
          onClick={() => setDescuentoAbierto(true)}
          className="press"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '11px 16px', minHeight: 46, border: 'none', background: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ flex: 1, fontSize: 14, color: breakdown.discount > 0 ? 'var(--u-text-2)' : 'var(--u-text-3)' }}>
            {breakdown.discount > 0 ? 'Descuento' : 'Descuento o cortesía'}
          </span>
          {breakdown.discount > 0 && (
            <Mono size={15} color="var(--brand-accent-ink)">{`−${money(breakdown.discount, currency)}`}</Mono>
          )}
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </button>
        {breakdown.orderCount > 1 && <><Hr /><BillRow label={`${breakdown.orderCount} rondas de pedidos`} value="" /></>}
        <Hr full />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
        }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--u-text)' }}>Total de la mesa</span>
          <Mono size={20}>{money(breakdown.grandTotal, currency)}</Mono>
        </div>
      </Group>

      {printMsg && (
        <div style={{
          fontSize: 12, lineHeight: 1.5, padding: '9px 12px', borderRadius: 'var(--radius-md)',
          color: printMsg.bad ? 'var(--c-danger, #f87171)' : 'var(--c-ok, #4ade80)',
          background: printMsg.bad ? 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)' : 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)',
        }}>
          {printMsg.text}
        </div>
      )}

      {/* ── Acciones ─────────────────────────────────────
          Como en el lienzo: la advertencia a la izquierda y las dos
          acciones a la derecha, en la misma fila. Eran dos botones
          gordos apilados a todo lo ancho, del diseño anterior. */}
      <div className="wp-billact">
        <p className="wp-billact-note">
          {allPaid
            ? 'Todo marcado como cobrado. Al cerrar se apunta la forma de pago y la mesa queda libre.'
            : `Quedan ${money(pendingTotal, currency)} sin cobrar en esta mesa.`}
        </p>
        <button
          type="button"
          disabled={printing}
          onClick={() => print(null)}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0,
            height: 40, padding: '0 16px', borderRadius: 'var(--radius-md)', cursor: printing ? 'wait' : 'pointer',
            border: '1px solid var(--adm-border-2)', background: 'none',
            color: 'var(--u-text-2)', fontWeight: 600, fontSize: 14, opacity: printing ? 0.6 : 1,
          }}
        >
          <Icon name="print" size={15} />
          {printing ? 'Enviando…' : 'Imprimir'}
        </button>
        <button
          type="button"
          disabled={freeing}
          onClick={() => setClosing(true)}
          className="press btn-accent"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0, minHeight: 40, padding: '0 18px', borderRadius: 'var(--radius-md)', border: 'none', cursor: freeing ? 'default' : 'pointer', fontWeight: 600, fontSize: 14, opacity: freeing ? 0.6 : 1 }}
        >
          {freeing ? 'Cerrando…' : (
            <>
              <Icon name="creditCard" size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Cobrar y cerrar
            </>
          )}
        </button>
      </div>

      {descuentoAbierto && (
        <DiscountDialog
          restaurantId={restaurantId}
          tableNumber={tableNumber}
          /* La base es `orders.subtotal`, NO la suma de las líneas vivas.
             Son el mismo número en un pedido sano —place_order escribe uno
             desde las otras— pero el servidor calcula el porcentaje sobre
             `subtotal`, y si aquí se usara otra cifra el botón prometería
             un descuento y se aplicaría otro. Una sola regla, la del
             servidor. */
          consumo={orders.reduce((s, o) => s + Number(o.subtotal ?? 0), 0)}
          descuentoActual={breakdown.discount}
          money={(n) => money(n, currency)}
          onClose={() => setDescuentoAbierto(false)}
          onDone={(monto) => {
            setDescuentoAbierto(false);
            setPrintMsg({
              text: monto > 0
                ? `Descuento de ${money(monto, currency)} aplicado a la mesa.`
                : 'Descuento quitado.',
              bad: false,
            });
            /* La cuenta vive en el padre (`billOrders`), así que hay que
               pedirla de nuevo: sin esto el total de aquí seguiría siendo
               el de antes del descuento y se cobraría de más. */
            onDiscountApplied();
          }}
        />
      )}

      {closing && (
        <CloseTableSheet
          tableNumber={tableNumber}
          total={breakdown.grandTotal}
          pending={pendingTotal}
          money={(n) => money(n, currency)}
          busy={freeing}
          onCancel={() => setClosing(false)}
          onConfirm={(pagos) => { setClosing(false); onFreeTable(pagos); }}
        />
      )}
    </div>
  );
}

/* ── Piezas ───────────────────────────────────────────────── */

function BillRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', minHeight: 40 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--u-text-3)' }}>{label}</span>
      <Mono size={14} color={accent ? 'var(--c-ok)' : 'var(--u-text-2)'}>{value}</Mono>
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
        width: 52, height: 52, borderRadius: 'var(--radius-lg)', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 600, color: 'var(--u-text)', opacity: disabled ? 0.35 : 1,
      }}
    >
      {label}
    </button>
  );
}

/* Una linea de la cuenta.
   ------------------------------------------------------------------
   En el lienzo la casilla de "esto lo paga esta persona" va a la
   IZQUIERDA, delante del nombre del plato, como en cualquier lista que
   se marca. Estaba al final del renglon, detras del importe y pegada al
   boton rojo de anular: donde nadie la busca, y a un dedo de anular el
   plato por error. */
function LineCard({
  line, currency, interactive, claimedBy, activeId, labelOf, onTap, onVoid, primera,
}: {
  line: BillLine;
  currency: PanelCurrency;
  interactive: boolean;
  claimedBy: string[];
  activeId: string;
  labelOf: (id: string) => string;
  onTap: () => void;
  onVoid: () => void;
  primera: boolean;
}) {
  const mine = interactive && claimedBy.includes(activeId);
  const shared = claimedBy.length > 1;

  return (
    <>
    {!primera && <Hr />}
    <div
      onClick={interactive ? onTap : undefined}
      className={interactive ? 'press' : undefined}
      style={{
        padding: '11px 12px 11px 16px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 52,
        cursor: interactive ? 'pointer' : 'default',
        background: mine ? 'color-mix(in srgb, var(--adm-accent-500) 8%, transparent)' : undefined,
      }}
    >
      {interactive && (
        <span style={{
          width: 22, height: 22, borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'grid', placeItems: 'center',
          border: mine ? 'none' : '1.5px solid var(--adm-border-2)',
          background: mine ? 'var(--adm-accent-500)' : 'transparent',
          color: '#ffffff',
        }}>
          {mine && <Icon name="check" size={13} strokeWidth={3} />}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>
          {line.quantity} · {line.name}
        </div>
        {line.options && (
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, lineHeight: 1.35 }}>{line.options}</div>
        )}
        {line.voidedQuantity > 0 && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', fontWeight: 600, marginTop: 1 }}>
            {line.voidedQuantity} anulada{line.voidedQuantity === 1 ? '' : 's'}
          </div>
        )}
        {interactive && (
          <div style={{
            fontSize: 12, marginTop: 2, fontWeight: 600,
            color: claimedBy.length === 0 ? 'var(--c-warn)' : 'var(--brand-accent-ink)',
          }}>
            {claimedBy.length === 0
              ? 'Sin asignar'
              : shared
                ? `Compartido: ${claimedBy.map(labelOf).join(', ')}`
                : `De ${labelOf(claimedBy[0])}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Mono>{money(line.lineTotal, currency)}</Mono>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onVoid(); }}
          title="Anular este plato"
          aria-label={`Anular ${line.name}`}
          className="press"
          style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-danger-line)', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="x" size={12} />
        </button>
      </div>
    </div>
    </>
  );
}
