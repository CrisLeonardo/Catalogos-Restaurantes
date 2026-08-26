'use client';

/* WaiterPanel — interfaz táctil para meseros.
   Flujo guiado en 3 pasos: Mesa → Menú → Revisar, + tab "Mis pedidos".
   Diseñado para minimizar errores: mesa siempre visible, buscador,
   contador por plato y mesas ocupadas marcadas.

   Responsive: en móvil es una columna a pantalla completa; en PC/tablet
   grande el contenido se centra en una columna cómoda (.waiter-wrap) en
   vez de estirarse a todo lo ancho. Si el restaurante diseñó su plano del
   salón (config.floorPlan), las mesas se muestran colocadas como en el local
   y con pestañas por nivel; si no, se usa la cuadrícula automática. */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon, ICON_PATHS } from '@/components/icons';
import FloorMap, { TableToken, fmtOccupied } from '@/components/admin/floor-map';
import { createWaiterOrder, updateOrderStatus, freeTable, getTableBill, archiveAbandonedTables } from '@/lib/actions/orders';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { getQueuedOrders, saveQueuedOrder, removeQueuedOrder } from '@/lib/order-queue';
import WaiterBill, { clearSavedSplit } from '@/components/admin/waiter-bill';
import VoidOrderDialog from '@/components/admin/void-order-dialog';
import type { Category, Product, ProductOptionGroup, OrderStatus } from '@/types';
import type { FloorPlan } from '@/lib/theme/defaults';
import { remainingQuantity, type OrderWithItems, type TableOccupancy, type TableCall } from '@/lib/db/orders';
import { tablesWithState, needsAttention, type TableState } from '@/lib/table-state';
import type { PanelCurrency } from '@/components/admin/order-card';
import {
  STATUS_LABEL_SHORT, STATUS_CHIP, nextStatus, nextLabel, isCardTerminal,
  stageClock, fmtElapsed, clockChipClass,
} from '@/lib/order-status';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Borrador del pedido en curso ──────────────────────────────
   El carrito vive en memoria: hasta ahora, tocar "Menú" o "Negocio" en la
   barra inferior del panel desmontaba esta pantalla y se llevaba por delante
   una orden de doce platos sin decir una palabra. Se guarda en el propio
   aparato (no en la nube: es un borrador, no un pedido) y caduca en 6 h —
   un turno—, para que nadie se encuentre mañana con el carrito de anoche. */
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

interface OrderDraft {
  cart: CartLine[];
  tableNumber: number | null;
  takeaway: boolean;
  guestName: string;
  notes: string;
  savedAt: number;
}

function draftKey(restaurantId: string, waiterId: string): string {
  return `leogin:waiter-draft:${restaurantId}:${waiterId}`;
}

function readDraft(restaurantId: string, waiterId: string): OrderDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(restaurantId, waiterId));
    if (!raw) return null;
    const d = JSON.parse(raw) as OrderDraft;
    if (!Array.isArray(d.cart) || d.cart.length === 0) return null;
    if (!d.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(restaurantId, waiterId));
      return null;
    }
    return d;
  } catch { return null; }
}

/* ── Tipos locales ────────────────────────────────────────── */
interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  options: { groupId: string; groupName: string; choiceId: string; choiceName: string; priceDelta: number; variantId?: string; variantName?: string }[];
  /** Nota libre para este plato (ej. "sin cebolla"), distinta de la nota general del pedido. */
  note?: string;
}

interface Props {
  waiterId: string;
  waiterName: string;
  restaurantId: string;
  restaurantName: string;
  categories: Category[];
  products: Product[];
  initialOrders: OrderWithItems[];
  /** Mesa → desde cuándo se ocupó y quién la atiende (null = comensal por su cuenta). */
  occupiedSince: Record<number, TableOccupancy>;
  /** Mesa → llamada del comensal sin resolver (migración 122). */
  tableCalls?: Record<number, TableCall>;
  tableCount: number;
  /** Propina para pedidos en mesa (DINE_IN). */
  tipEnabled: boolean;
  /** Propina para pedidos PARA LLEVAR (PICKUP) — puede estar configurada
      distinta a la de mesa, y el mesero ahora puede tomar ambos. */
  tipEnabledPickup: boolean;
  /** El restaurante acepta pedidos para llevar (config.orderTypes). */
  pickupEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
  floorPlan: FloorPlan | null;
  /** Hub local del restaurante (Fase 2 offline) — fallback cuando la nube no
      responde, antes de encolar el pedido en este dispositivo. */
  hubUrl: string | null;
  hubToken: string | null;
}

/** Objetivo de un modal de anulación en curso: null = cerrado. */
type VoidTarget = {
  orderId: string;
  orderStatus: OrderStatus;
  /** null = anular el pedido completo. */
  item: { id: string; name: string; remainingQty: number } | null;
};

/* ── Helpers ──────────────────────────────────────────────── */
let _lineSeq = 0;
/** Id único y estable para cada línea del carrito (evita Date.now() en render). */
function newLineId(productId: string): string {
  _lineSeq += 1;
  return `${productId}-${_lineSeq}`;
}

function money(n: number, c: PanelCurrency): string {
  let num: string;
  try { num = n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { num = n.toFixed(2); }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}


/* ── Modal de opciones del producto (diseño igual al cliente) ── */
/** Sin `line`: valores por defecto (single/required → primera opción, combo →
    todo incluido). Con `line` (editar una línea ya agregada): reconstruye la
    selección exacta que tenía, incluyendo combos con componentes quitados. */
function initModalSelection(groups: ProductOptionGroup[], line?: CartLine): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    if (line) {
      sel[g.id] = line.options.filter((o) => o.groupId === g.id).map((o) => o.choiceId);
      continue;
    }
    if (g.type === 'combo') {
      sel[g.id] = g.choices.map((c) => c.id);
    } else if (g.type === 'single' && g.required && g.choices.length > 0) {
      sel[g.id] = [g.choices[0].id];
    } else {
      sel[g.id] = [];
    }
  }
  return sel;
}

/** Variante inicial de cada componente con variantes: la de `line` si se está
    editando; si no, la primera (igual que la hoja del comensal) — el precio
    ya la usaba como fallback, la píldora debe verse marcada desde el inicio. */
function initModalVariants(groups: ProductOptionGroup[], line?: CartLine): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups) {
    for (const c of g.choices) {
      const savedVariantId = line?.options.find((o) => o.choiceId === c.id)?.variantId;
      if (savedVariantId) { sel[c.id] = savedVariantId; continue; }
      if (!line && c.variants?.length) sel[c.id] = c.variants[0].id;
    }
  }
  return sel;
}

function ProductOptionsModal({
  product,
  currency,
  initialLine,
  onAdd,
  onSave,
  onClose,
}: {
  product: Product;
  currency: PanelCurrency;
  /** Si viene, la hoja edita esta línea del carrito en vez de agregar una nueva. */
  initialLine?: CartLine;
  onAdd: (line: CartLine) => void;
  onSave?: (lineId: string, line: Omit<CartLine, 'lineId'>) => void;
  onClose: () => void;
}) {
  const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initModalSelection(groups, initialLine));
  /** choiceId -> variantId elegida (solo choices de combo con variantes). */
  const [variantSelected, setVariantSelected] = useState<Record<string, string>>(() => initModalVariants(groups, initialLine));
  const [qty, setQty] = useState(initialLine?.quantity ?? 1);
  const [note, setNote] = useState(initialLine?.note ?? '');
  /** Grupo obligatorio sin elegir, señalado en la propia hoja. Antes esto era
      un alert() del navegador: una caja gris del sistema operativo encima de
      la app, sin decir cuál de los grupos faltaba. */
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);

  function toggleChoice(group: ProductOptionGroup, choiceId: string) {
    setMissingGroupId((m) => (m === group.id ? null : m));
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === 'single') {
        const next = current.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(choiceId)) {
        return { ...prev, [group.id]: current.filter((c) => c !== choiceId) };
      }
      if (group.type === 'multi' && group.max && group.max > 0 && current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, choiceId] };
    });
    const choice = group.choices.find((c) => c.id === choiceId);
    if (choice?.variants?.length && !variantSelected[choiceId]) {
      setVariantSelected((prev) => ({ ...prev, [choiceId]: choice.variants![0].id }));
    }
  }

  function chooseVariant(choiceId: string, variantId: string) {
    setVariantSelected((prev) => ({ ...prev, [choiceId]: variantId }));
  }

  function buildOptions() {
    const opts: CartLine['options'] = [];
    for (const group of groups) {
      for (const choiceId of selected[group.id] ?? []) {
        const choice = group.choices.find((c) => c.id === choiceId);
        if (!choice) continue;
        const variant = choice.variants?.length
          ? choice.variants.find((v) => v.id === variantSelected[choice.id]) ?? choice.variants[0]
          : undefined;
        const priceDelta = (Number(choice.priceDelta) || 0) + (variant ? Number(variant.priceDelta) || 0 : 0);
        opts.push({
          groupId: group.id, groupName: group.name, choiceId: choice.id, choiceName: choice.name, priceDelta,
          ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
        });
      }
    }
    return opts;
  }

  /** Primer grupo obligatorio sin respuesta, o null si está todo listo. */
  function firstMissingGroup(): ProductOptionGroup | null {
    for (const group of groups) {
      if (group.type === 'single' && group.required && !(selected[group.id]?.length)) return group;
    }
    return null;
  }

  function handleAdd() {
    const missing = firstMissingGroup();
    if (missing) {
      setMissingGroupId(missing.id);
      document.getElementById(`optgrp-${missing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const opts = buildOptions();
    const delta = opts.reduce((s, o) => s + o.priceDelta, 0);
    const trimmedNote = note.trim() || undefined;
    if (initialLine && onSave) {
      onSave(initialLine.lineId, {
        productId: product.id, name: product.name, price: product.price + delta,
        quantity: qty, options: opts, note: trimmedNote,
      });
    } else {
      for (let i = 0; i < qty; i++) {
        onAdd({ lineId: newLineId(product.id), productId: product.id, name: product.name, price: product.price + delta, quantity: 1, options: opts, note: trimmedNote });
      }
    }
    onClose();
  }

  const delta = buildOptions().reduce((s, o) => s + o.priceDelta, 0);
  const finalPrice = product.price + delta;

  return (
    <div onClick={onClose} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--u-hair)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)' }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
              {money(finalPrice, currency)} por unidad
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0, marginLeft: 10 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
          {groups.map((group) => {
            const picked = selected[group.id] ?? [];
            const isCombo = group.type === 'combo';
            const required = group.type === 'single' && !!group.required;
            const hint = isCombo ? 'Personaliza el combo'
              : required ? 'Elige uno'
              : group.max && group.max > 0 ? `Opcional · máx ${group.max}` : 'Opcional';
            const missing = missingGroupId === group.id;

            return (
              <div key={group.id} id={`optgrp-${group.id}`} className="opt-group">
                <div className="opt-head">
                  <span className="opt-title">{group.name}</span>
                  <span className="opt-hint" data-required={required ? '1' : '0'}>{hint}</span>
                </div>

                {missing && (
                  <div className="note note-warn" style={{ marginBottom: 10 }}>
                    <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    Falta elegir {group.name.toLowerCase()}.
                  </div>
                )}

                {isCombo ? (
                  /* Combo: filas con checkmark, precio visible como ahorro al quitar */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.choices.map((choice) => {
                      const included = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <button type="button" onClick={() => toggleChoice(group, choice.id)} aria-pressed={included} className="press opt-row">
                            <span className="opt-check">
                              {included && <Icon name="check" size={12} strokeWidth={3} />}
                            </span>
                            <span className="opt-row-name">{choice.name}</span>
                            {d > 0 && (
                              <span className="opt-row-delta">
                                {included ? `+${money(d, currency)}` : `−${money(d, currency)}`}
                              </span>
                            )}
                          </button>
                          {included && choice.variants && choice.variants.length > 0 && (
                            <div className="opt-variants">
                              {choice.variants.map((variant) => {
                                const on = variantSelected[choice.id] === variant.id;
                                const vDelta = Number(variant.priceDelta) || 0;
                                return (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); chooseVariant(choice.id, variant.id); }}
                                    aria-pressed={on}
                                    className="press opt-pill opt-pill-sm"
                                  >
                                    {variant.name}
                                    {vDelta !== 0 && (
                                      <span className="opt-delta">{vDelta > 0 ? '+' : '−'}{money(Math.abs(vDelta), currency)}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Single / Multi: píldoras */
                  <div className="opt-pills">
                    {group.choices.map((choice) => {
                      const on = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <button key={choice.id} type="button" onClick={() => toggleChoice(group, choice.id)} aria-pressed={on} className="press opt-pill">
                          {on && <Icon name="check" size={13} strokeWidth={3} />}
                          {choice.name}
                          {d !== 0 && (
                            <span className="opt-delta">{d > 0 ? '+' : '−'}{money(Math.abs(d), currency)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cantidad */}
          <div className="opt-group">
            <div className="opt-head"><span className="opt-title">Cantidad</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="button" aria-label="Quitar una" onClick={() => setQty((q) => Math.max(1, q - 1))} className="press glass-quiet" style={{ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
              <button type="button" aria-label="Agregar una" onClick={() => setQty((q) => Math.min(20, q + 1))} className="press glass-quiet" style={{ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>+</button>
            </div>
          </div>

          {/* Nota para cocina — por plato, no se confunde con la nota general
              del pedido (ej. "sin cebolla" en esta hamburguesa pero no en la
              otra que va en el mismo pedido). */}
          <div className="opt-group">
            <div className="opt-head"><span className="opt-title">Nota para cocina</span><span className="opt-hint" data-required="0">Opcional</span></div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              placeholder="Sin cebolla, término medio…"
              style={{ background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 12, padding: '12px 14px', color: 'var(--u-text)', fontSize: 15, outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--u-hair)' }}>
          <button type="button" onClick={handleAdd} className="press btn-accent" style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>{initialLine ? 'Guardar cambios' : `Agregar ${qty > 1 ? `${qty} ×` : ''}`}</span>
            <span style={{ opacity: 0.55 }}>·</span>
            <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money(finalPrice * qty, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Encabezado compartido ─────────────────────────────────── */
function WaiterHeader({
  title, waiterName, onBack, showOrders, ordersCount, onShowOrders,
}: {
  title: string;
  waiterName: string;
  onBack?: () => void;
  showOrders: boolean;
  ordersCount: number;
  onShowOrders: () => void;
}) {
  return (
    /* Ya NO es sticky: con el sidebar/topbar del panel siempre visibles
       (rediseño 2026-08-22), pegarla a top:0 la haría pelear por el mismo
       lugar que .admin-topbar. Vive dentro del contenido, como el
       encabezado de cualquier otra pantalla del panel. */
    <header style={{
      background: 'linear-gradient(color-mix(in srgb, var(--u-text) 4%, transparent), color-mix(in srgb, var(--u-text) 4%, transparent)), color-mix(in srgb, var(--brand-bg) 82%, transparent)',
      borderBottom: '1px solid var(--u-hair)',
      borderRadius: 16,
    }}>
      <div className="waiter-wrap waiter-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
        {onBack && (
          <button type="button" onClick={onBack} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="chevronLeft" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="userPlus" size={12} /> {waiterName}</div>
        </div>
        {showOrders && (
          <button type="button" onClick={onShowOrders} className="press glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            <Icon name="list" size={14} /> Pedidos{ordersCount > 0 ? ` (${ordersCount})` : ''}
          </button>
        )}
      </div>
    </header>
  );
}

/* ── Panel principal ──────────────────────────────────────── */
type View = 'tables' | 'menu' | 'review' | 'orders' | 'bill';

export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders, occupiedSince, tableCalls,
  tableCount, tipEnabled, tipEnabledPickup, pickupEnabled, tipPercent, currency, floorPlan,
  hubUrl, hubToken,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>('tables');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  /* Pedido PARA LLEVAR: el mesero levanta la orden sin mesa (mostrador,
     barra, alguien que entra y pide para llevar). Antes el paso 1 era un
     muro: sin número de mesa no había forma de seguir, aunque el pedido
     fuera perfectamente válido. Va como PICKUP, no como DINE_IN. */
  const [takeaway, setTakeaway] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [tableToFree, setTableToFree] = useState<number | null>(null);
  /* Liberar sin cobrar pide confirmación explícita: es irreversible y roza el dinero. */
  const [confirmFree, setConfirmFree] = useState(false);
  const [freeing, startFree] = useTransition();
  const [productModal, setProductModal] = useState<Product | null>(null);
  /** Línea del carrito que se está editando (null = la hoja está agregando una nueva). */
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  /* ── Capa de teclado ─────────────────────────────────────
     Para el local que apunta la comanda en una libreta y la teclea en la
     caja. El ratón sigue funcionando igual: el teclado acelera, no
     sustituye. Cada atajo tiene su botón equivalente en pantalla. */
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [kbIndex, setKbIndex] = useState(0);
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [, startStatus] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  // Pedidos sin sincronizar con la nube (fallback offline, ver handleSubmit).
  const [queuedCount, setQueuedCount] = useState(0);
  const retryingQueueRef = useRef(false);

  /* ── Borrador y salida protegida ──────────────────────────── */
  /** Pedido sin enviar que quedó de una visita anterior (ver readDraft). */
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  /** Destino al que el mesero intentó salir con el carrito lleno. */
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  /* ── Anulación (motivo + aprobación) ─────────────────────── */
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);

  /* ── Cuenta de mesa / dividir cuenta ──────────────────────── */
  // Todo el reparto (modo, personas, asignación, quién ya pagó) vive dentro de
  // WaiterBill y se guarda por mesa: aquí solo se cargan los pedidos.
  const [billTable, setBillTable] = useState<number | null>(null);
  const [billOrders, setBillOrders] = useState<OrderWithItems[] | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  /* ── Archivar mesas abandonadas (>24h) ────────────────────── */
  const [archiving, startArchive] = useTransition();
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  /* Al entrar: ¿quedó un pedido sin enviar de la última vez? No se restaura
     solo —aparecer con platos que uno no acaba de tocar asusta más de lo que
     ayuda—: se ofrece en el paso 1 y el mesero decide. */
  useEffect(() => {
    setDraft(readDraft(restaurantId, waiterId));
  }, [restaurantId, waiterId]);

  /* Guardar el borrador en cuanto cambie algo del pedido. */
  useEffect(() => {
    const key = draftKey(restaurantId, waiterId);
    try {
      if (cart.length === 0) { localStorage.removeItem(key); return; }
      const d: OrderDraft = { cart, tableNumber, takeaway, guestName, notes, savedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(d));
    } catch { /* modo privado / cuota llena: el borrador es un extra, no un requisito */ }
  }, [cart, tableNumber, takeaway, guestName, notes, restaurantId, waiterId]);

  /* Salir del panel con el carrito lleno pide confirmación. El disparador
     real son los seis destinos de la barra inferior, que están a un dedo del
     botón "Revisar pedido". Se intercepta en fase de CAPTURA para llegar
     antes que el <Link> de Next. */
  useEffect(() => {
    if (cart.length === 0) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      const href = a.getAttribute('href') ?? '';
      // Solo navegación interna que SAQUE de esta pantalla.
      if (!href.startsWith('/') || href.startsWith('/admin/mesero')) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    // Cerrar la pestaña o recargar: aviso del navegador (el único posible ahí).
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ''; }
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [cart.length]);

  /** Retoma el borrador guardado y lleva al mesero donde lo dejó. */
  function resumeDraft() {
    if (!draft) return;
    setCart(draft.cart);
    setTableNumber(draft.tableNumber);
    setTakeaway(draft.takeaway);
    setGuestName(draft.guestName);
    setNotes(draft.notes);
    setDraft(null);
    setView('menu');
  }

  /** Descarta el borrador guardado (y su copia en el aparato). */
  function discardDraft() {
    try { localStorage.removeItem(draftKey(restaurantId, waiterId)); } catch { /* nada que limpiar */ }
    setDraft(null);
  }

  async function loadTableBill(n: number) {
    setBillTable(n);
    setBillLoading(true);
    setBillError(null);
    const res = await getTableBill(restaurantId, n);
    setBillLoading(false);
    if ('error' in res) { setBillError(res.error); return; }
    setBillOrders(res.orders);
  }

  // Coalescer de router.refresh() (mismo patrón que orders-panel.tsx): una
  // ráfaga de eventos Realtime (p. ej. la cola offline del hub sincronizando
  // 20 pedidos de golpe) disparaba un re-render completo POR EVENTO y
  // congelaba la tablet del mesero. Máximo un refresh cada 2.5 s.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh  = useRef(0);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) return;
    const wait = Math.max(0, 2500 - (Date.now() - lastRefresh.current));
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      lastRefresh.current = Date.now();
      router.refresh();
    }, wait);
  }, [router]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // Precalienta el hub HTTPS (DNS + permiso de red local) mientras hay señal,
  // para que el fallback funcione si el internet se cae a mitad del turno.
  useEffect(() => {
    warmUpHub(hubUrl);
  }, [hubUrl]);

  // Nivel activo del plano del salón (si está habilitado).
  const planEnabled = !!floorPlan?.enabled && (floorPlan?.levels.length ?? 0) > 0;
  const levels = floorPlan?.levels ?? [];
  const [activeLevel, setActiveLevel] = useState<string>(levels[0]?.id ?? '');

  /** Reintenta los pedidos que quedaron en la cola local del mesero (offline
      total: ni la nube ni el hub respondieron). Éxito o rechazo definitivo
      del servidor → se quitan de la cola (mismo patrón silencioso que la
      reconciliación en segundo plano de checkout-form.tsx); fallo de red →
      se quedan para el siguiente intento. */
  async function retryWaiterQueue() {
    if (retryingQueueRef.current) return;
    retryingQueueRef.current = true;
    try {
      for (const q of getQueuedOrders(restaurantId, 'waiter')) {
        try {
          const result = await createWaiterOrder(q.payload);
          if (result.success || result.error) {
            removeQueuedOrder(restaurantId, q.clientId, 'waiter');
          }
        } catch { /* sigue sin conexión: se reintenta en el próximo ciclo */ }
      }
    } finally {
      setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
      retryingQueueRef.current = false;
    }
  }

  // Al montar: cuenta lo que ya estaba en cola (pestaña cerrada a mitad de un
  // corte) y lo reintenta en segundo plano.
  useEffect(() => {
    setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
    retryWaiterQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Reintento automático mientras haya algo en cola: al volver la señal y,
  // de respaldo, cada 15s (mismo ritmo que checkout-form.tsx).
  useEffect(() => {
    if (queuedCount === 0) return;
    const onOnline = () => retryWaiterQueue();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => retryWaiterQueue(), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCount]);

  // Realtime: actualiza mis pedidos cuando hay cambios.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    (async () => {
      await ready;
      if (cancelled) return;

      channel = supabase
        .channel(`waiter-orders-${waiterId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
          refreshSoon();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
          refreshSoon();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      stopAuthSync();
    };
  }, [waiterId, refreshSoon]);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Reloj para el temporizador de mesas ocupadas (arranca en null: servidor y
  // primer render pintan sin tiempo transcurrido, evita mismatch de hidratación).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  const occupiedSet = useMemo(() => new Set(Object.keys(occupiedSince).map(Number)), [occupiedSince]);

  /* El salón, resuelto por la regla única (lib/table-state.ts). `now` entra
     como dependencia a propósito: los avisos por reloj —un plato listo que
     lleva rato en la barra— tienen que aparecer solos sin recargar. */
  const salon = useMemo(
    () => tablesWithState(tableCount, occupiedSince, tableCalls ?? {}, now),
    [tableCount, occupiedSince, tableCalls, now],
  );
  const stateByTable = useMemo(() => {
    const m: Record<number, TableState> = {};
    for (const t of salon) m[t.n] = t.state;
    return m;
  }, [salon]);
  const urgentes = useMemo(() => needsAttention(salon), [salon]);
  const ocupadas = useMemo(() => salon.filter((t) => t.state.kind !== 'libre').length, [salon]);

  /** Mesas que llevan más de 24h ocupadas: casi seguro un pedido olvidado,
      no operación real (ver auditoría Fase 1 — auto-archivo). */
  const abandonedCount = useMemo(() => {
    if (now == null) return 0;
    return Object.values(occupiedSince).filter((occ) => now - new Date(occ.since).getTime() > DAY_MS).length;
  }, [occupiedSince, now]);

  function handleArchiveAbandoned() {
    setArchiveMsg(null);
    startArchive(async () => {
      const res = await archiveAbandonedTables(restaurantId);
      if (res.error) { setArchiveMsg(res.error); return; }
      setArchiveMsg(
        res.archived && res.archived > 0
          ? `Se archivaron ${res.archived} mesa${res.archived === 1 ? '' : 's'} abandonada${res.archived === 1 ? '' : 's'}.`
          : 'No había mesas abandonadas por archivar.',
      );
      router.refresh();
    });
  }

  /* ── Carrito ─────────────────────────────────────────── */
  function addToCart(line: CartLine) {
    setCart((prev) => {
      // La nota entra en la clave de fusión: dos líneas con las mismas
      // opciones pero notas distintas ("sin sal" vs. sin nota) son platos
      // distintos para cocina y no deben mezclarse en una sola cantidad.
      const idx = prev.findIndex(
        (l) => l.productId === line.productId &&
          JSON.stringify(l.options) === JSON.stringify(line.options) &&
          (l.note ?? '') === (line.note ?? ''),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
  }

  /** Reemplaza una línea existente del carrito (editar opciones/nota/cantidad
      de un plato ya agregado, ver ProductOptionsModal en modo edición). */
  function saveLine(lineId: string, updated: Omit<CartLine, 'lineId'>) {
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...updated, lineId } : l)));
  }

  /** Abre la hoja de opciones para editar una línea ya agregada al carrito. */
  function openEditLine(line: CartLine) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    setEditingLine(line);
    setProductModal(product);
  }

  function closeProductModal() {
    setProductModal(null);
    setEditingLine(null);
  }

  function decLine(lineId: string) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.lineId === lineId);
      if (idx < 0) return prev;
      const next = [...prev];
      if (next[idx].quantity > 1) {
        next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  }

  function incLine(line: CartLine) {
    setCart((prev) => prev.map((l) => l.lineId === line.lineId ? { ...l, quantity: l.quantity + 1 } : l));
  }

  /* Cantidad total en carrito de un producto (sumando variantes). */
  function cartQtyOf(productId: string): number {
    return cart.reduce((s, l) => l.productId === productId ? s + l.quantity : s, 0);
  }

  /* Quita una unidad del producto (la primera línea que lo tenga). */
  function decProduct(productId: string) {
    const line = cart.find((l) => l.productId === productId);
    if (line) decLine(line.lineId);
  }

  function handleProductTap(product: Product, quantity = 1) {
    const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
    if (groups.length === 0) {
      addToCart({ lineId: newLineId(product.id), productId: product.id, name: product.name, price: product.price, quantity, options: [] });
    } else {
      // Con opciones no se puede adivinar: la hoja pregunta, como siempre.
      setProductModal(product);
    }
  }

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  /* La propina depende del TIPO de pedido: el restaurante puede cobrarla en
     mesa y no para llevar. El servidor la recalcula igual (computeTip), esto
     es solo lo que ve el mesero antes de enviar. */
  const tipApplies = takeaway ? tipEnabledPickup : tipEnabled;
  /** A dónde va este pedido: "Mesa 4" o "Para llevar". */
  const destLabel = takeaway ? 'Para llevar' : `Mesa ${tableNumber}`;
  const tipAmount = tipApplies && subtotal > 0 ? Math.round(subtotal * tipPercent) / 100 : 0;
  const total = subtotal + tipAmount;

  function resetOrder() {
    setCart([]);
    setGuestName('');
    setNotes('');
    setTableNumber(null);
    setTakeaway(false);
    setSubmitError(null);
    setMiniCartOpen(false);
  }

  /* Selecciona una mesa: ocupada → diálogo; libre → al menú. */
  function selectTable(n: number) {
    if (occupiedSet.has(n)) { setTableToFree(n); }
    else { setTakeaway(false); setTableNumber(n); setSearch(''); setView('menu'); }
  }

  /** Arranca un pedido sin mesa (para llevar / mostrador). */
  function startTakeaway() {
    setTakeaway(true);
    setTableNumber(null);
    setSearch('');
    setView('menu');
  }

  async function handleSubmit() {
    if (!tableNumber && !takeaway) { setSubmitError('Elige la mesa o toca «Para llevar».'); return; }
    if (cart.length === 0) { setSubmitError('El carrito está vacío.'); return; }
    setSubmitError(null);

    const finalName = guestName.trim() || (takeaway ? 'Para llevar' : `Mesa ${tableNumber}`);
    const clientId = crypto.randomUUID();

    const input = {
      restaurantId,
      clientId,
      // Solo lo usa el camino del hub offline (offline-orders/route.ts): la
      // nube ya resuelve el mesero de la sesión real, ver createWaiterOrder.
      waiterId,
      items: cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        // El variantId es obligatorio para el servidor cuando el componente
        // tiene variantes (resolveItemOptions lo exige) — sin él, TODO pedido
        // de mesero con combo+variantes era rechazado con "Elige una variante".
        options: l.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}) })),
        ...(l.note ? { note: l.note } : {}),
      })),
      customer: {
        name: finalName,
        phone: '',
        // Para llevar es PICKUP: no ocupa mesa, no entra al plano del salón y
        // el flujo de estados del pedido es el de mostrador, no el de mesa.
        type: (takeaway ? 'PICKUP' : 'DINE_IN') as 'PICKUP' | 'DINE_IN',
        ...(takeaway ? {} : { tableNumber: tableNumber as number }),
        notes: notes.trim() || undefined,
      },
      tipAccepted: tipApplies && subtotal > 0,
    };

    startSubmit(async () => {
      // WRITE-AHEAD: el pedido se guarda en la cola del dispositivo ANTES de
      // intentar cualquier red, y solo se quita tras un resultado definitivo.
      // Bug real reproducido en pruebas (2026-07-10): con la nube caída, la
      // página murió DURANTE la ventana del fallback (~2.5 s) y el pedido —
      // que solo existía en memoria — se perdió sin dejar rastro (ni nube,
      // ni hub, ni cola). Con la cola primero, el peor caso es un pedido que
      // se reenvía solo más tarde — nunca uno perdido; el clientId
      // idempotente (migración 061) garantiza que jamás se duplica aunque el
      // reintento y este envío lleguen ambos.
      saveQueuedOrder(restaurantId, { clientId, payload: input, queuedAt: new Date().toISOString() }, 'waiter');
      try {
        const result = await createWaiterOrder(input);
        // Respuesta del servidor (éxito o rechazo definitivo): ya no es un
        // pedido "en el aire" — fuera de la cola en ambos casos.
        removeQueuedOrder(restaurantId, clientId, 'waiter');
        if (result.error) {
          setSubmitError(result.error);
          return;
        }
        setSubmitOk(`Pedido ${result.orderNumber} enviado a cocina.`);
        resetOrder();
        setTimeout(() => { setSubmitOk(null); setView('orders'); }, 1600);
        router.refresh();
      } catch {
        // La nube no respondió (sin conexión o WiFi inestable): intenta el
        // hub local del restaurante antes de dejarlo encolado en este
        // dispositivo.
        if (hubUrl) {
          const hubResult = await tryHubOrder(hubUrl, hubToken, input);
          if (hubResult?.success) {
            // El hub ya lo tiene (impreso y en SU cola de sincronización):
            // sacarlo de la cola del dispositivo para no reenviarlo también
            // desde aquí.
            removeQueuedOrder(restaurantId, clientId, 'waiter');
            setSubmitOk(`Pedido ${hubResult.orderNumber} impreso — se sincronizará solo en cuanto vuelva la señal.`);
            resetOrder();
            setTimeout(() => { setSubmitOk(null); setView('orders'); }, 2200);
            return;
          }
        }
        // Sin nube y sin hub: se queda donde ya estaba (cola local).
        setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
        setSubmitOk('Sin conexión: el pedido quedó guardado en este dispositivo y se enviará solo en cuanto vuelva la señal.');
        resetOrder();
        setTimeout(() => { setSubmitOk(null); setView('orders'); }, 2600);
      }
    });
  }

  /* ── Filtrado de productos ───────────────────────────── */
  /* Un número al principio ES la cantidad: «3 lim» son tres limonadas.
     Es lo que permite teclear una comanda entera desde una libreta sin
     soltar el teclado — el caso del restaurante que apunta en papel y
     teclea en la caja. Se acepta hasta 99 para que «100 gramos» no se
     lea como cien de algo. */
  const qtyMatch = /^(\d{1,2})\s+(.+)$/.exec(search.trim());
  const typedQty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
  const query = (qtyMatch ? qtyMatch[2] : search.trim()).toLowerCase();
  const visibleProducts = products.filter((p) => {
    if (!p.is_available || !p.is_active) return false;
    if (query) return p.name.toLowerCase().includes(query);
    if (activeCat !== null) return p.category_id === activeCat;
    return true;
  });

  /* ── UI compartida ───────────────────────────────────── */
  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
    borderRadius: 12, padding: '12px 14px', color: 'var(--u-text)', fontSize: 15, outline: 'none', width: '100%',
  };

  const headerProps = {
    waiterName,
    showOrders: view !== 'orders',
    ordersCount: orders.length,
    onShowOrders: () => setView('orders'),
  };

  /* Aviso de salida con pedido a medias. Se pinta en todas las vistas del
     panel porque el toque que lo dispara —la barra inferior— está siempre
     ahí. Ojo: el pedido NO se pierde aunque se salga (queda de borrador en
     el aparato), pero salir sin querer con la comanda a medio tomar es de
     todos modos lo peor que le puede pasar a un mesero en hora pico. */
  const exitGuard = pendingHref === null ? null : (
    <div onClick={() => setPendingHref(null)} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: '22px 20px 28px' }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
          Tienes un pedido a medias
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.45 }}>
          {cartCount} {cartCount === 1 ? 'plato' : 'platos'} para {destLabel.toLowerCase()}, sin enviar a cocina.
          Si sales ahora se guarda como borrador y lo puedes retomar al volver.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => setPendingHref(null)}
            className="press btn-accent"
            style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
          >
            Seguir con el pedido
          </button>
          <button
            type="button"
            onClick={() => { const href = pendingHref; setPendingHref(null); if (href) router.push(href); }}
            className="press glass-quiet"
            style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)' }}
          >
            Salir de todos modos
          </button>
        </div>
      </div>
    </div>
  );

  /* Mesa pedida por la URL (?mesa=7). Es lo que permite que el salón del
     panel del dueño enlace directo a una mesa, y que recargar en medio del
     turno no devuelva al mesero al principio. Se aplica UNA vez: después
     manda lo que el mesero toque. */
  const urlMesaAplicada = useRef(false);
  useEffect(() => {
    if (urlMesaAplicada.current) return;
    urlMesaAplicada.current = true;
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('mesa');
    const n = raw == null ? NaN : Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > tableCount) return;
    if (occupiedSet.has(n)) { setTableToFree(n); return; }
    setTableNumber(n);
    setSearch('');
    setView('menu');
    // Solo al montar: la URL es el punto de partida, no una fuente continua.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Atajos de teclado ─────────────────────────────────────
     Solo se enganchan en la vista del menú, que es donde se teclea la
     comanda. Nunca se roba el foco en pantalla táctil: enfocar un campo
     ahí levanta el teclado en pantalla y tapa media carta. */
  const canAdd = view === 'menu';

  useEffect(() => {
    // El buscador arranca enfocado en aparatos con teclado: escribir es la
    // acción por defecto, no hay que ir a buscar el campo.
    if (!canAdd) return;
    const fine = typeof window !== 'undefined'
      && window.matchMedia?.('(pointer: fine)').matches;
    if (fine) searchRef.current?.focus();
  }, [canAdd]);

  // Al cambiar la búsqueda, el resultado marcado vuelve al primero.
  useEffect(() => { setKbIndex(0); }, [search, activeCat]);

  /* El atajo tiene que enviar el carrito de AHORA, pero suscribirse en cada
     render solo porque handleSubmit se recrea es tirar trabajo. El ref guarda
     siempre la última versión y el listener se engancha una vez. */
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitRef.current = () => { if (cart.length > 0) handleSubmit(); };
  });

  useEffect(() => {
    if (!canAdd) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const enCampo = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

      // Enviar a cocina exige DOS teclas a propósito: un Enter suelto jamás
      // debe mandar una comanda a medias.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitRef.current();
        return;
      }
      // Volver al salón para cambiar de mesa.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setView('tables');
        return;
      }
      // "/" devuelve el foco al buscador desde donde sea.
      if (e.key === '/' && !enCampo) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAdd]);

  /** Teclas dentro del buscador: mover, agregar y seguir escribiendo. */
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setKbIndex((i) => Math.min(i + 1, Math.max(0, visibleProducts.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKbIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setSearch('');
      return;
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const p = visibleProducts[kbIndex];
      if (!p) return;
      handleProductTap(p, typedQty);
      // El campo se limpia y el foco se queda: esto es lo que permite
      // teclear la comanda de corrido sin volver a hacer clic.
      setSearch('');
      setKbIndex(0);
    }
  }

  /* ── El riel del salón (solo 1024 px o más) ────────────────
     En pantalla ancha el salón NUNCA desaparece: se queda a la
     izquierda mientras se toma la comanda, así agregar un plato deja
     de ser un viaje de ida y vuelta. En el teléfono este riel no se
     dibuja (lo apaga .waiter-rail en globals.css) y el salón sigue
     siendo la pantalla de inicio, como siempre. */
  const rail = (
    <aside className="waiter-rail" aria-label="Salón">
      <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, padding: 3, borderRadius: 11, background: 'color-mix(in srgb, var(--u-text) 7%, transparent)' }}>
          {([['tables', 'Sala'], ['orders', 'Pedidos']] as const).map(([v, label]) => {
            const on = v === 'orders' ? view === 'orders' : view !== 'orders';
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="press"
                style={{
                  flex: 1, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: on ? 700 : 500,
                  background: on ? 'var(--admin-panel-bg, var(--brand-bg))' : 'transparent',
                  color: on ? 'var(--u-text)' : 'var(--u-text-3)',
                  boxShadow: on ? '0 1px 2px rgba(0,0,0,0.10)' : 'none',
                }}
              >
                {label}{v === 'orders' && orders.length > 0 ? ` (${orders.length})` : ''}
              </button>
            );
          })}
        </div>

        {urgentes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)', padding: '0 2px' }}>
              Te necesitan ahora
            </div>
            {urgentes.slice(0, 3).map((t) => (
              <button
                key={t.n}
                type="button"
                onClick={() => selectTable(t.n)}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11,
                  border: '1px solid color-mix(in srgb, var(--brand-accent) 34%, transparent)',
                  background: 'color-mix(in srgb, var(--brand-accent) 9%, transparent)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span className="t-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', flexShrink: 0 }}>
                  {t.n}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--brand-accent-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.state.label}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {salon.map((t) => (
            <TableToken
              key={t.n}
              n={t.n}
              state={t.state}
              total={t.occ ? money(t.occ.total, currency) : null}
              selected={tableNumber === t.n}
              onTap={() => selectTable(t.n)}
            />
          ))}
        </div>

        {pickupEnabled && (
          <button
            type="button"
            onClick={startTakeaway}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12,
              border: '1px solid var(--u-hair)', background: 'transparent', cursor: 'pointer',
              textAlign: 'left', width: '100%',
            }}
          >
            <Icon name="bag" size={17} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--u-text-2)' }}>Para llevar</span>
            <Icon name="plus" size={15} style={{ color: 'var(--brand-accent-ink)' }} />
          </button>
        )}
      </div>
    </aside>
  );

  /* ════════════════ VISTA: MIS PEDIDOS ════════════════ */
  if (view === 'orders') {
    return (
      <div className="waiter-shell">
        {rail}
        <div className="waiter-pane">
          <WaiterHeader {...headerProps} title="Mis pedidos" onBack={() => setView(tableNumber || takeaway ? 'menu' : 'tables')} />
          {exitGuard}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="waiter-wrap-narrow waiter-pad" style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="button" onClick={() => { setView('tables'); }} className="press btn-accent" style={{ padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                ＋ Nuevo pedido
              </button>
              {queuedCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-warn, #f59e0b) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 30%, transparent)', color: 'var(--c-warn)', fontSize: 13, fontWeight: 600 }}>
                  <Icon name="clock" size={15} />
                  {queuedCount === 1 ? '1 pedido sin sincronizar — se enviará solo al volver la señal.' : `${queuedCount} pedidos sin sincronizar — se enviarán solos al volver la señal.`}
                </div>
              )}
              {statusError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-danger, #f87171) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)', color: 'var(--c-danger)', fontSize: 13, fontWeight: 600 }}>
                  <Icon name="alertCircle" size={15} />
                  {statusError}
                </div>
              )}
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--u-text-4)', fontSize: 15 }}>
                  Sin pedidos activos. Tus pedidos en curso aparecerán aquí.
                </div>
              ) : orders.map((order) => {
                const next = nextStatus(order.status, order.order_type);
                // SERVED también es terminal aquí (ya no hay más botón de avance en la
                // tarjeta del pedido — cerrar la mesa es solo vía "Marcar como libre" en
                // el diálogo de la mesa), aunque para las queries de ocupación no cuenta
                // como cerrado (la mesa sigue viéndose ocupada).
                const isTerminal = isCardTerminal(order.status);
                // Mismo cronómetro por etapa que el panel de pedidos: el mesero es
                // quien tiene que darse cuenta de que un plato lleva 12 minutos
                // listo en la barra sin que nadie lo haya llevado a la mesa.
                const clk = stageClock(order, 10, 20);
                const elapsedMs = clk && now != null ? now - new Date(clk.since).getTime() : 0;
                return (
                  <div key={order.id} className="glass" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, opacity: isTerminal ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="t-mono" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{order.order_number}</span>
                          <span className={`chip ${STATUS_CHIP[order.status]}`}>{STATUS_LABEL_SHORT[order.status]}</span>
                          {clk && now != null && (
                            <span className={`chip ${clockChipClass(elapsedMs / 60000, clk)}`} title={clk.label}>
                              <Icon name="clock" size={11} /> {fmtElapsed(elapsedMs)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginTop: 3 }}>{order.customer_name}</div>
                        {order.address && <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="grid" size={12} /> {order.address}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--u-text)' }}>
                          {money(Number(order.total), currency)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {order.items.map((item) => {
                        const remaining = remainingQuantity(item, order.voids ?? []);
                        const voidedQty = item.quantity - remaining;
                        const unitPrice = item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--u-text-2)' }}>
                            <span>
                              {remaining}× {item.name_snapshot}
                              {voidedQty > 0 && (
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--c-danger)', fontWeight: 600 }}>
                                  {voidedQty} anulada{voidedQty === 1 ? '' : 's'}
                                </span>
                              )}
                              {item.note && (
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--c-warn)', fontWeight: 600 }}>
                                  ⚠ {item.note}
                                </span>
                              )}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ fontWeight: 600 }}>{money(unitPrice * remaining, currency)}</span>
                              {!isTerminal && remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setVoidTarget({ orderId: order.id, orderStatus: order.status, item: { id: item.id, name: item.name_snapshot, remainingQty: remaining } })}
                                  title="Anular"
                                  className="press"
                                  style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--c-danger-line)', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                >
                                  <Icon name="x" size={11} />
                                </button>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {!isTerminal && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {next && (
                          <button
                            type="button"
                            onClick={() => startStatus(async () => {
                              setStatusError(null);
                              const res = await updateOrderStatus(order.id, next as import('@/types').OrderStatus);
                              if (res.error) { setStatusError(res.error); return; }
                              router.refresh();
                            })}
                            className="press btn-accent"
                            style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                          >
                            {nextLabel(order.status, order.order_type)}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setVoidTarget({ orderId: order.id, orderStatus: order.status, item: null })}
                          className="press"
                          style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 8%, transparent)', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {voidTarget && (
            <VoidOrderDialog
              orderId={voidTarget.orderId}
              orderStatus={voidTarget.orderStatus}
              item={voidTarget.item}
              onClose={() => setVoidTarget(null)}
              onDone={() => { setVoidTarget(null); router.refresh(); }}
            />
          )}
        </div>
      </div>
    );
  }

  /* ════════════════ VISTA: ELEGIR MESA ════════════════ */
  if (view === 'tables') {
    // Mesas colocadas en el nivel activo (si el plano está habilitado).
    const planTables = planEnabled
      ? (floorPlan?.tables ?? []).filter((t) => t.level === activeLevel && t.n <= tableCount)
      : [];
    // Referencias del salón de este nivel (barra, recepción, cocina…).
    const planFixtures = planEnabled
      ? (floorPlan?.fixtures ?? []).filter((f) => f.level === activeLevel)
      : [];
    const placedNums = new Set((floorPlan?.tables ?? []).filter((t) => t.n <= tableCount).map((t) => t.n));
    const otherTables = planEnabled
      ? Array.from({ length: tableCount }, (_, i) => i + 1).filter((n) => !placedNums.has(n))
      : [];

    return (
      <div className="waiter-shell">
        {rail}
        <div className="waiter-pane">
          <WaiterHeader {...headerProps} title={restaurantName} />
          {exitGuard}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="waiter-wrap waiter-pad" style={{ padding: '18px 0 40px' }}>
              {/* Se acabó el «Paso 1 de 3». Un mesero toma sesenta comandas
                  por turno: no necesita que le numeren los pasos, y menos
                  cada vez. El salón es el inicio, no el primer paso de un
                  asistente. */}
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--u-text)' }}>Sala</div>
              <div style={{ fontSize: 14, color: 'var(--u-text-3)', marginTop: 4, marginBottom: 16 }}>
                {ocupadas === 0
                  ? 'Todas las mesas libres'
                  : `${ocupadas} ${ocupadas === 1 ? 'mesa con gente' : 'mesas con gente'}${urgentes.length > 0 ? ` · ${urgentes.length} ${urgentes.length === 1 ? 'te necesita' : 'te necesitan'}` : ''}`}
              </div>

              {/* Borrador rescatado: el pedido que se estaba tomando la última
                  vez y nunca salió a cocina (ver readDraft). */}
              {draft && cart.length === 0 && (
                <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, marginBottom: 14, border: '1px solid color-mix(in srgb, var(--c-warn) 35%, transparent)' }}>
                  <Icon name="alertCircle" size={17} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
                      Pedido sin enviar
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                      {draft.cart.reduce((n, l) => n + l.quantity, 0)} platos para {draft.takeaway ? 'llevar' : `la mesa ${draft.tableNumber}`}
                    </div>
                  </div>
                  <button type="button" onClick={resumeDraft} className="press btn-accent" style={{ padding: '9px 15px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    Retomar
                  </button>
                  <button type="button" onClick={discardDraft} className="press glass-quiet" style={{ padding: '9px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--u-text-3)' }}>
                    Descartar
                  </button>
                </div>
              )}

              {/* Pedido sin mesa. Va ARRIBA del plano y no escondido al final:
                  quien entra a pedir para llevar no debería tener que buscar
                  cómo decirlo entre veinte mesas. */}
              {pickupEnabled && (
                <button
                  type="button"
                  onClick={startTakeaway}
                  className="press glass"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 15px', marginBottom: 16, borderRadius: 14,
                    border: '1.5px dashed var(--u-hair-2)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink)' }}>
                    <Icon name="bag" size={19} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Para llevar · sin mesa</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>Mostrador, barra o alguien que pasa a recoger</span>
                  </span>
                  <Icon name="chevronRight" size={18} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
                </button>
              )}

              {abandonedCount > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 14, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)' }}>
                  <Icon name="alertCircle" size={16} style={{ color: 'var(--c-danger)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)' }}>
                    {abandonedCount} mesa{abandonedCount === 1 ? '' : 's'} con más de 24h ocupada{abandonedCount === 1 ? '' : 's'} — probablemente un pedido olvidado.
                  </span>
                  <button
                    type="button"
                    onClick={handleArchiveAbandoned}
                    disabled={archiving}
                    className="press"
                    style={{ padding: '7px 13px', borderRadius: 99, border: 'none', cursor: archiving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12.5, background: 'var(--c-danger, #f87171)', color: '#fff', opacity: archiving ? 0.7 : 1, flexShrink: 0 }}
                  >
                    {archiving ? 'Archivando…' : 'Archivar mesas abandonadas'}
                  </button>
                </div>
              )}
              {archiveMsg && (
                <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', marginBottom: 14, padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--u-text) 5%, transparent)' }}>
                  {archiveMsg}
                </div>
              )}

              {/* En pantalla ancha el salón ya está en el riel de la
                  izquierda: aquí solo se dibuja cuando NO hay riel. */}
              <div className="waiter-only-narrow">
              {planEnabled ? (
                <>
                  {/* Pestañas de nivel (solo si hay más de uno) */}
                  {levels.length > 1 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {levels.map((l) => {
                        const on = l.id === activeLevel;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setActiveLevel(l.id)}
                            className="press"
                            style={{ padding: '9px 16px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)', fontSize: 13.5, fontWeight: 600 }}
                          >
                            {l.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Mapa del salón (zoom + paneo) */}
                  <FloorMap tables={planTables} fixtures={planFixtures} occupied={occupiedSet} occupiedSince={occupiedSince} states={stateByTable} now={now} onSelect={selectTable} />

                  {/* Otras mesas (sin ubicar en el plano) */}
                  {otherTables.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Otras mesas</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                        {otherTables.map((n) => (
                          <TableToken key={n} n={n} state={stateByTable[n]} total={occupiedSince[n] ? money(occupiedSince[n].total, currency) : null} selected={tableNumber === n} onTap={() => selectTable(n)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="waiter-tables-grid">
                  {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => (
                    <TableToken key={n} n={n} state={stateByTable[n]} total={occupiedSince[n] ? money(occupiedSince[n].total, currency) : null} selected={tableNumber === n} onTap={() => selectTable(n)} />
                  ))}
                </div>
              )}
              </div>

              {/* Pantalla ancha, sin mesa elegida: el panel derecho no se
                  queda en blanco. Contesta la única pregunta que importa en
                  hora pico — quién me necesita ahora — y de paso saca a la
                  vista las mesas que ya comieron y nadie cobró, que es la
                  fuga de dinero más común de un salón lleno. */}
              <div className="waiter-only-wide">
                {urgentes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--u-text-4)', fontSize: 15 }}>
                    {ocupadas === 0
                      ? 'El salón está vacío. Toca una mesa para empezar.'
                      : 'Todo al día. Toca una mesa del salón para verla o agregarle platos.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', padding: '0 2px' }}>
                      Te necesitan ahora
                    </div>
                    {urgentes.map((t) => (
                      <button
                        key={t.n}
                        type="button"
                        onClick={() => selectTable(t.n)}
                        className="press glass"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14,
                          border: '1px solid color-mix(in srgb, var(--brand-accent) 34%, transparent)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                      >
                        <span className="t-mono" style={{ fontSize: 19, fontWeight: 700, color: 'var(--u-text)', width: 34, flexShrink: 0 }}>
                          {t.n}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--brand-accent-ink)' }}>
                            {t.state.label}
                          </span>
                          {t.occ && (
                            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                              {t.occ.itemCount} {t.occ.itemCount === 1 ? 'plato' : 'platos'}
                              {t.occ.waiterName ? ` · ${t.occ.waiterName}` : ' · pedido por el comensal'}
                            </span>
                          )}
                        </span>
                        {t.occ && (
                          <span className="t-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', flexShrink: 0 }}>
                            {money(t.occ.total, currency)}
                          </span>
                        )}
                        <Icon name="chevronRight" size={17} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Diálogo: opciones para mesa ocupada */}
          {tableToFree !== null && (
            <div onClick={() => { setTableToFree(null); setConfirmFree(false); }} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
              <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, padding: '20px 20px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)' }}>Mesa {tableToFree}</div>
                    <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
                      Tiene un pedido activo{tableToFree != null && occupiedSince[tableToFree] && now != null ? ` · ocupada hace ${fmtOccupied(now - new Date(occupiedSince[tableToFree].since).getTime())}` : ''}
                      {tableToFree != null && occupiedSince[tableToFree] && (
                        occupiedSince[tableToFree].waiterName
                          ? ` · atendida por ${occupiedSince[tableToFree].waiterName}`
                          : ' · pedido por el comensal'
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setTableToFree(null); setConfirmFree(false); }} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
                    <Icon name="x" size={18} />
                  </button>
                </div>
                {/* La mesa es el expediente, no un menú de tres verbos sin
                    relación. Lo que hay en ella se lee primero; las acciones
                    van después y en orden de uso. */}
                {tableToFree != null && occupiedSince[tableToFree] && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', marginBottom: 14 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--u-text-2)' }}>
                      {occupiedSince[tableToFree].itemCount}{' '}
                      {occupiedSince[tableToFree].itemCount === 1 ? 'plato' : 'platos'}
                      {stateByTable[tableToFree] ? ` · ${stateByTable[tableToFree].label}` : ''}
                    </div>
                    <div className="t-mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--u-text)' }}>
                      {money(occupiedSince[tableToFree].total, currency)}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setTableToFree(null); setConfirmFree(false); setTableNumber(tableToFree); setSearch(''); setView('menu'); }}
                    className="press btn-accent"
                    style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Icon name="plus" size={17} /> Agregar platos
                  </button>
                  <button
                    type="button"
                    onClick={() => { const n = tableToFree!; setTableToFree(null); setConfirmFree(false); loadTableBill(n); setView('bill'); }}
                    className="press glass-quiet"
                    style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'var(--u-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Icon name="list" size={16} /> Cobrar y cerrar la mesa
                  </button>

                  {/* Liberar sin cobrar deja de ser un botón rojo pegado a
                      «Agregar platos»: es otra cosa, vive aparte y al final.
                      Cerrar una mesa por error en hora pico es lo peor que le
                      puede pasar a un turno. */}
                  <div style={{ height: 1, background: 'var(--u-hair)', margin: '6px 0 2px' }} />
                  {!confirmFree ? (
                    <button
                      type="button"
                      onClick={() => setConfirmFree(true)}
                      className="press"
                      style={{ padding: '11px', borderRadius: 12, border: 'none', background: 'none', color: 'var(--u-text-3)', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}
                    >
                      Liberar sin cobrar
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 28%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 7%, transparent)' }}>
                      <div style={{ fontSize: 13, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
                        La mesa {tableToFree} queda libre y su consumo{' '}
                        {tableToFree != null && occupiedSince[tableToFree]
                          ? `de ${money(occupiedSince[tableToFree].total, currency)} `
                          : ''}
                        se cierra sin cobrar. Queda anotado que fuiste tú.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setConfirmFree(false)}
                          className="press glass-quiet"
                          style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}
                        >
                          Mejor no
                        </button>
                        <button
                          type="button"
                          disabled={freeing}
                          onClick={() => {
                            const n = tableToFree!;
                            startFree(async () => {
                              const res = await freeTable(restaurantId, n);
                              if (res.error) { setStatusError(res.error); }
                              setConfirmFree(false);
                              setTableToFree(null);
                              router.refresh();
                            });
                          }}
                          className="press"
                          style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--c-danger, #f87171)', color: '#fff', cursor: freeing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, opacity: freeing ? 0.6 : 1 }}
                        >
                          {freeing ? 'Liberando…' : 'Sí, liberar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════ VISTA: CUENTA DE MESA / DIVIDIR ════════════════ */
  if (view === 'bill') {
    return (
      <div className="waiter-shell">
        {rail}
        <div className="waiter-pane">
          <WaiterHeader {...headerProps} title={`Cuenta · Mesa ${billTable}`} onBack={() => { setView('tables'); setBillTable(null); setBillOrders(null); }} />
          {exitGuard}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="waiter-wrap-narrow waiter-pad" style={{ padding: '16px 0' }}>
              {billLoading && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)' }}>Cargando cuenta…</div>
              )}
              {billError && (
                <div style={{ fontSize: 13, color: 'var(--c-danger)', padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)' }}>{billError}</div>
              )}
              {!billLoading && !billError && billOrders && billTable != null && (
                <WaiterBill
                  restaurantId={restaurantId}
                  tableNumber={billTable}
                  orders={billOrders}
                  currency={currency}
                  freeing={freeing}
                  onVoidItem={setVoidTarget}
                  onFreeTable={() => {
                    const n = billTable;
                    startFree(async () => {
                      const res = await freeTable(restaurantId, n);
                      if (res.error) { alert(res.error); return; }
                      // La mesa se fue: su reparto ya no le sirve a nadie y
                      // heredarlo a los próximos comensales sería peor que
                      // empezar de cero.
                      clearSavedSplit(restaurantId, n);
                      setView('tables'); setBillTable(null); setBillOrders(null);
                      router.refresh();
                    });
                  }}
                />
              )}
            </div>
          </div>

          {voidTarget && (
            <VoidOrderDialog
              orderId={voidTarget.orderId}
              orderStatus={voidTarget.orderStatus}
              item={voidTarget.item}
              onClose={() => setVoidTarget(null)}
              onDone={() => { setVoidTarget(null); if (billTable) loadTableBill(billTable); router.refresh(); }}
            />
          )}
        </div>
      </div>
    );
  }

  /* ════════════════ VISTA: REVISAR Y ENVIAR ════════════════ */
  if (view === 'review') {
    return (
      <div className="waiter-shell">
        {rail}
        <div className="waiter-pane">
          <WaiterHeader {...headerProps} title={`Revisar · ${destLabel}`} onBack={() => setView('menu')} />
          {exitGuard}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="waiter-wrap-narrow waiter-pad" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Orden ({cartCount})</div>
                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                    Aún no agregaste platos. <button type="button" onClick={() => setView('menu')} style={{ color: 'var(--brand-accent-ink)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Volver al menú</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cart.map((line) => (
                      <div key={line.lineId} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: 'var(--u-text)', fontWeight: 600 }}>{line.name}</div>
                          {line.options.length > 0 && (
                            // La variante elegida (sabor/tipo) se muestra junto al componente —
                            // el mesero debe poder confirmar "Bebida (Fanta)" antes de enviar.
                            <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                              {line.options.map((o) => (o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName)).join(', ')}
                            </div>
                          )}
                          {line.note && (
                            <div style={{ fontSize: 11.5, color: 'var(--c-warn)', fontWeight: 600, marginTop: 1 }}>
                              ⚠ {line.note}
                            </div>
                          )}
                          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>{money(line.price, currency)} c/u</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button type="button" onClick={() => openEditLine(line)} aria-label={`Editar ${line.name}`} title="Editar opciones o nota" className="press glass-quiet" style={{ width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Icon name="edit" size={14} />
                          </button>
                          <button type="button" onClick={() => decLine(line.lineId)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                          <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{line.quantity}</span>
                          <button type="button" onClick={() => incLine(line)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Nombre / referencia (opcional)</div>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={takeaway ? 'Nombre de quien recoge' : `Mesa ${tableNumber}`} style={inputStyle} />
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notas especiales</div>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alergias, sin sal, extra salsa…" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Barra fija inferior: total + enviar. El fondo sigue al tema (antes
              rgba(0,0,0,0.35) fijo: en modo claro quedaba una franja oscura con
              texto oscuro encima — ilegible). */}
          <div style={{ borderTop: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--brand-bg) 82%, transparent)', backdropFilter: 'blur(16px)' }}>
            <div className="waiter-wrap-narrow waiter-pad" style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tipApplies && tipAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Subtotal</span>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{money(subtotal, currency)}</span>
                </div>
              )}
              {tipApplies && tipAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Propina ({tipPercent}%)</span>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{money(tipAmount, currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, color: 'var(--u-text-2)', fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)' }}>{money(total, currency)}</span>
              </div>
              {submitError && <div style={{ fontSize: 13, color: 'var(--c-danger)', padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 20%, transparent)' }}>{submitError}</div>}
              {submitOk && <div style={{ fontSize: 13, color: 'var(--c-ok)', padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-ok, #4ade80) 20%, transparent)' }}>{submitOk}</div>}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0}
                className="press btn-accent"
                style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: submitting || cart.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: submitting || cart.length === 0 ? 0.6 : 1 }}
              >
                {submitting ? 'Enviando…' : <><Icon name="bell" size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Enviar a cocina</>}
              </button>
            </div>
          </div>

          {productModal && (
            <ProductOptionsModal product={productModal} currency={currency} initialLine={editingLine ?? undefined} onAdd={addToCart} onSave={saveLine} onClose={closeProductModal} />
          )}
        </div>
      </div>
    );
  }

  /* ════════════════ VISTA: MENÚ (agregar platos) ════════════════ */
  return (
    <div className="waiter-shell">
      {rail}
      <div className="waiter-pane">
        <WaiterHeader {...headerProps} title={destLabel} onBack={() => setView('tables')} />
        {exitGuard}

        {/* Buscador */}
        <div className="waiter-wrap waiter-pad" style={{ width: '100%', padding: '12px 0 6px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-4)', display: 'grid', placeItems: 'center' }}>
              <Icon name="search" size={17} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              ref={searchRef}
              onKeyDown={onSearchKeyDown}
              placeholder="Buscar plato…"
              aria-label="Buscar plato. Escribe un número antes del nombre para poner la cantidad."
              style={{ ...inputStyle, paddingLeft: 40, paddingRight: search ? 40 : 14 }}
            />
            {qtyMatch && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 12, fontWeight: 700, color: 'var(--brand-accent-ink)',
                  background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
                  padding: '3px 8px', borderRadius: 99, pointerEvents: 'none',
                }}
              >
                ×{typedQty}
              </span>
            )}
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <Icon name="x" size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Categorías (ocultas al buscar) */}
        {!query && (
          <div className="waiter-wrap waiter-pad" style={{ width: '100%', display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0 10px', flexShrink: 0, scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => setActiveCat(null)}
              className="press"
              style={{
                whiteSpace: 'nowrap', padding: '9px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
                background: activeCat === null ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 7%, transparent)',
                color: activeCat === null ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                flexShrink: 0,
              }}
            >
              Todos
            </button>
            {categories.filter((c) => c.is_active).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                className="press"
                style={{
                  whiteSpace: 'nowrap', padding: '9px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
                  background: activeCat === cat.id ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 7%, transparent)',
                  color: activeCat === cat.id ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                  flexShrink: 0,
                }}
              >
                {cat.icon && (
                  ICON_PATHS[cat.icon]
                    ? <><Icon name={cat.icon} size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} /></>
                    : <span style={{ marginRight: 4 }}>{cat.icon}</span>
                )}{cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Productos */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="waiter-wrap waiter-pad" style={{ padding: '4px 0 96px' }}>
            {visibleProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                {query ? 'Ningún plato coincide con tu búsqueda.' : 'Sin productos disponibles en esta categoría.'}
              </div>
            ) : (
              <div className="waiter-menu-grid">
                {visibleProducts.map((p, i) => {
                  const qty = cartQtyOf(p.id);
                  const hasOptions = ((p.options as ProductOptionGroup[] | null) ?? []).length > 0;
                  // Resultado marcado por teclado. Solo mientras se busca: sin
                  // búsqueda no hay "el siguiente", hay una carta entera.
                  const marcado = !!query && i === kbIndex;
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleProductTap(p, typedQty)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProductTap(p, typedQty); } }}
                      aria-current={marcado ? 'true' : undefined}
                      className="press glass"
                      style={{
                        // Acolchado ajustado a la columna angosta del teléfono
                        // (dos por fila): con 14 px por lado el nombre de un
                        // plato de tres palabras se partía en tres renglones.
                        borderRadius: 14, padding: '12px 12px 11px', position: 'relative', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 6,
                        border: qty > 0 || marcado ? '1.5px solid var(--brand-accent)' : '1.5px solid transparent',
                        boxShadow: marcado ? '0 0 0 3px color-mix(in srgb, var(--brand-accent) 22%, transparent)' : undefined,
                      }}
                    >
                      {qty > 0 && (
                        <span style={{ position: 'absolute', top: 8, right: 8, minWidth: 24, height: 24, padding: '0 6px', borderRadius: 99, background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)', fontSize: 13, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                          {qty}
                        </span>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--u-text)' }}>
                        {p.icon && (
                          ICON_PATHS[p.icon]
                            ? <Icon name={p.icon} size={23} />
                            : <span style={{ fontSize: 23 }}>{p.icon}</span>
                        )}
                        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, paddingRight: qty > 0 ? 24 : 0 }}>{p.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-accent-ink)' }}>{money(p.price, currency)}</span>
                      </div>

                      {/* Controles rápidos: +/- para productos sin opciones; "+ Agregar" para los que tienen.
                          stopPropagation en todos: si no, el tap también dispara el onClick de la tarjeta
                          entera y el plato se agrega dos veces. */}
                      {hasOptions ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setProductModal(p); }} className="press" style={{ marginTop: 2, padding: '10px', borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                          {qty > 0 ? 'Agregar otro' : '+ Elegir opciones'}
                        </button>
                      ) : qty > 0 ? (
                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); decProduct(p.id); }} className="press" style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleProductTap(p); }} className="press" style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                        </div>
                      ) : (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleProductTap(p); }} className="press" style={{ marginTop: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                          + Agregar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Atajos a la vista, junto a la acción, no escondidos en una ayuda:
            así el mesero que empieza con el ratón los va aprendiendo solo.
            Solo en pantalla ancha — en el teléfono no hay teclado físico. */}
        <div className="waiter-only-wide waiter-wrap waiter-pad" style={{ flexShrink: 0, padding: '2px 0 10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: 'var(--u-text-4)' }}>
            {([
              ['Enter', 'agregar y seguir'],
              ['2 + nombre', 'agregar dos'],
              ['↑ ↓', 'moverse'],
              ['⌘ K', 'cambiar de mesa'],
              ['⌘ Enter', 'enviar a cocina'],
            ] as const).map(([k, que]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <kbd
                  style={{
                    fontFamily: 'var(--font-mono, ui-monospace), monospace', fontSize: 11, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 5, color: 'var(--u-text-3)',
                    border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                  }}
                >
                  {k}
                </kbd>
                {que}
              </span>
            ))}
          </div>
        </div>

        {/* Barra flotante del carrito → Revisar, con mini-carrito desplegable
            para ver/ajustar lo ya agregado sin salir del menú. */}
        {cartCount > 0 && (
          <div className="waiter-cart-bar" style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(to top, var(--brand-bg) 60%, transparent)', flexShrink: 0 }}>
            <div className="waiter-wrap waiter-pad" style={{ padding: '0 0 12px' }}>
              {miniCartOpen && (
                <div className="glass anim-slide-up" style={{ borderRadius: 16, padding: '8px 10px', marginBottom: 8, maxHeight: '34vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cart.map((line) => (
                    <div key={line.lineId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>
                        {line.note && (
                          <div style={{ fontSize: 11, color: 'var(--c-warn)', fontWeight: 600 }}>⚠ {line.note}</div>
                        )}
                      </div>
                      <button type="button" onClick={() => decLine(line.lineId)} className="press glass-quiet" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', color: 'var(--u-text)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>−</button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{line.quantity}</span>
                      <button type="button" onClick={() => incLine(line)} className="press glass-quiet" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', color: 'var(--u-text)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>+</button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMiniCartOpen((v) => !v)}
                className="press"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px', marginBottom: 6, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--u-text-3)', fontSize: 11.5, fontWeight: 600 }}
              >
                <Icon name="chevronDown" size={12} style={{ transform: miniCartOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                {miniCartOpen ? 'Ocultar pedido' : 'Ver pedido actual'}
              </button>
              <button
                type="button"
                onClick={() => setView('review')}
                className="press btn-accent"
                style={{ width: '100%', padding: '15px 18px', borderRadius: 16, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontWeight: 700, fontSize: 15.5 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 26, height: 26, borderRadius: 99, background: 'rgba(0,0,0,0.18)', display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: 800 }}>{cartCount}</span>
                  Revisar pedido
                </span>
                <span>{money(total, currency)} →</span>
              </button>
            </div>
          </div>
        )}

        {productModal && (
          <ProductOptionsModal product={productModal} currency={currency} initialLine={editingLine ?? undefined} onAdd={addToCart} onSave={saveLine} onClose={closeProductModal} />
        )}
      </div>
    </div>
  );
}
