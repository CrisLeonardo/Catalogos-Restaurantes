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
import LogoutButton from '@/components/admin/logout-button';
import FloorMap, { TableToken, fmtOccupied } from '@/components/admin/floor-map';
import { createWaiterOrder, updateOrderStatus, freeTable, getTableBill, archiveAbandonedTables } from '@/lib/actions/orders';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { getQueuedOrders, saveQueuedOrder, removeQueuedOrder } from '@/lib/order-queue';
import WaiterBill, { clearSavedSplit } from '@/components/admin/waiter-bill';
import VoidOrderDialog, { type VoidApprover } from '@/components/admin/void-order-dialog';
import type { Category, Product, ProductOptionGroup, OrderStatus } from '@/types';
import type { FloorPlan } from '@/lib/theme/defaults';
import { remainingQuantity, type OrderWithItems, type TableOccupancy } from '@/lib/db/orders';
import type { PanelCurrency } from '@/components/admin/order-card';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Tipos locales ────────────────────────────────────────── */
interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  options: { groupId: string; groupName: string; choiceId: string; choiceName: string; priceDelta: number; variantId?: string; variantName?: string }[];
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
  tableCount: number;
  tipEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
  floorPlan: FloorPlan | null;
  /** Hub local del restaurante (Fase 2 offline) — fallback cuando la nube no
      responde, antes de encolar el pedido en este dispositivo. */
  hubUrl: string | null;
  hubToken: string | null;
  /** Sesión iniciada por PIN — el menú ⋮ ofrece "Cambiar de usuario" en vez de "Salir". */
  isOperatorSession?: boolean;
  /** Staff con permiso 'aprobar_anulaciones' — para el modal de anulación. */
  voidApprovers?: VoidApprover[];
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

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nuevo', PREP: 'Preparando', READY: 'Listo', TRANSIT: 'En camino', SERVED: 'Servido', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  NEW: '#3b82f6', PREP: '#f59e0b', READY: '#8b5cf6', TRANSIT: '#f97316', SERVED: '#06b6d4', DELIVERED: '#22c55e', CANCEL: '#6b7280',
};

/** Para DINE_IN, "servir" no cierra la mesa: READY→SERVED (intermedio) y ahí
    se detiene el avance automático — solo "Marcar como libre" llega a DELIVERED. */
function nextStatus(status: string, type: string): string | null {
  if (status === 'NEW') return 'PREP';
  if (status === 'PREP') return 'READY';
  if (status === 'READY') return type === 'DINE_IN' ? 'SERVED' : 'DELIVERED';
  return null;
}
function nextLabel(status: string, type: string): string {
  if (status === 'NEW') return 'Confirmar';
  if (status === 'PREP') return 'Marcar listo';
  if (status === 'READY') return type === 'DINE_IN' ? 'Marcar servido' : 'Servir en mesa';
  return '';
}

/* ── Modal de opciones del producto (diseño igual al cliente) ── */
function initModalSelection(groups: ProductOptionGroup[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
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

/** Variante inicial de cada componente con variantes: la primera (igual que la
    hoja del comensal) — el precio ya la usaba como fallback, la píldora debe
    verse marcada desde el inicio. */
function initModalVariants(groups: ProductOptionGroup[]): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups) {
    for (const c of g.choices) {
      if (c.variants?.length) sel[c.id] = c.variants[0].id;
    }
  }
  return sel;
}

function ProductOptionsModal({
  product,
  currency,
  onAdd,
  onClose,
}: {
  product: Product;
  currency: PanelCurrency;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initModalSelection(groups));
  /** choiceId -> variantId elegida (solo choices de combo con variantes). */
  const [variantSelected, setVariantSelected] = useState<Record<string, string>>(() => initModalVariants(groups));
  const [qty, setQty] = useState(1);

  function toggleChoice(group: ProductOptionGroup, choiceId: string) {
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

  function validate(): string | null {
    for (const group of groups) {
      if (group.type === 'single' && group.required && !(selected[group.id]?.length)) {
        return `Elige "${group.name}"`;
      }
    }
    return null;
  }

  function handleAdd() {
    const err = validate();
    if (err) { alert(err); return; }
    const opts = buildOptions();
    const delta = opts.reduce((s, o) => s + o.priceDelta, 0);
    for (let i = 0; i < qty; i++) {
      onAdd({ lineId: newLineId(product.id), productId: product.id, name: product.name, price: product.price + delta, quantity: 1, options: opts });
    }
    onClose();
  }

  const delta = buildOptions().reduce((s, o) => s + o.priceDelta, 0);
  const finalPrice = product.price + delta;

  return (
    <div onClick={onClose} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)' }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>{money(finalPrice, currency)} por unidad</div>
          </div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0, marginLeft: 10 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map((group) => {
            const picked = selected[group.id] ?? [];
            const isCombo = group.type === 'combo';
            const hint = isCombo ? 'Personaliza tu combo'
              : group.type === 'single' ? (group.required ? 'Elige uno' : 'Opcional')
              : group.max && group.max > 0 ? `Opcional · máx ${group.max}` : 'Opcional';

            return (
              <div key={group.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{group.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{hint}</span>
                </div>

                {isCombo ? (
                  /* Combo: filas con checkmark, precio visible como ahorro al quitar */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.choices.map((choice) => {
                      const included = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button type="button" onClick={() => toggleChoice(group, choice.id)} className="press"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 13, cursor: 'pointer', textAlign: 'left',
                            background: included ? 'color-mix(in srgb, var(--c-ok-solid, #22c55e) 10%, transparent)' : 'color-mix(in srgb, var(--u-text) 3%, transparent)',
                            border: `1px solid ${included ? 'color-mix(in srgb, var(--c-ok-solid, #22c55e) 35%, transparent)' : 'var(--u-hair)'}` }}>
                          <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center',
                            background: included ? 'var(--c-ok-solid, #22c55e)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)', border: `1.5px solid ${included ? 'var(--c-ok-solid, #22c55e)' : 'var(--u-hair)'}` }}>
                            {included && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                          </span>
                          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: included ? 'var(--u-text)' : 'var(--u-text-3)', textDecoration: included ? 'none' : 'line-through' }}>
                            {choice.name}
                          </span>
                          {d > 0 && (
                            <span style={{ fontSize: 12, flexShrink: 0, color: included ? 'var(--u-text-2)' : 'var(--c-danger, #f87171)' }}>
                              {included ? `+${money(d, currency)}` : `−${money(d, currency)}`}
                            </span>
                          )}
                        </button>
                        {included && choice.variants && choice.variants.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 30 }}>
                            {choice.variants.map((variant) => {
                              const on = variantSelected[choice.id] === variant.id;
                              const vDelta = Number(variant.priceDelta) || 0;
                              return (
                                <button key={variant.id} type="button" onClick={(e) => { e.stopPropagation(); chooseVariant(choice.id, variant.id); }} className="press"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 99, cursor: 'pointer',
                                    background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                                    border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, fontWeight: 600, fontSize: 12 }}>
                                  {variant.name}
                                  {vDelta !== 0 && <span style={{ fontSize: 10.5, opacity: 0.8, color: 'inherit' }}>{vDelta > 0 ? '+' : '−'}{money(Math.abs(vDelta), currency)}</span>}
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {group.choices.map((choice) => {
                      const on = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <button key={choice.id} type="button" onClick={() => toggleChoice(group, choice.id)} className="press"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 99, cursor: 'pointer',
                            background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                            border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, fontWeight: 600, fontSize: 13 }}>
                          {on && <Icon name="check" size={13} />}
                          {choice.name}
                          {d !== 0 && <span style={{ fontSize: 11.5, opacity: 0.75 }}>{d > 0 ? '+' : '−'}{money(Math.abs(d), currency)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cantidad */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', marginBottom: 10 }}>Cantidad</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="press glass-quiet" style={{ width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} className="press glass-quiet" style={{ width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>+</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--u-hair)' }}>
          <button type="button" onClick={handleAdd} className="press btn-accent" style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            Agregar — {money(finalPrice * qty, currency)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Menú ⋮ del encabezado: hoy solo trae "Salir", pero queda listo para más
   opciones futuras del mesero sin competir por espacio con la navegación. */
function HeaderMenu({ isOperatorSession }: { isOperatorSession?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocClick);
    return () => document.removeEventListener('pointerdown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press glass-quiet"
        aria-label="Más opciones"
        style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}
      >
        <Icon name="more" size={19} />
      </button>
      {open && (
        <div className="glass anim-pop" style={{ position: 'absolute', right: 0, top: 46, zIndex: 210, minWidth: 160, borderRadius: 14, padding: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <LogoutButton variant="menu-item" isOperatorSession={isOperatorSession} />
        </div>
      )}
    </div>
  );
}

/* ── Encabezado compartido ─────────────────────────────────── */
function WaiterHeader({
  title, waiterName, onBack, onAdminBack, showOrders, ordersCount, onShowOrders, isOperatorSession,
}: {
  title: string;
  waiterName: string;
  onBack?: () => void;
  onAdminBack?: () => void;
  showOrders: boolean;
  ordersCount: number;
  onShowOrders: () => void;
  isOperatorSession?: boolean;
}) {
  return (
    /* Translúcida CON desenfoque, igual que .admin-topbar: antes el fondo era
       solo `--u-text 4%` (casi transparente y sin backdrop-filter), así que al
       hacer scroll los platos se leían ENCIMA del título de la barra. La capa
       de tinte va sobre una base de --brand-bg al 82% — es el desenfoque, no
       la opacidad, lo que separa la barra del contenido. */
    <header style={{
      background: 'linear-gradient(color-mix(in srgb, var(--u-text) 4%, transparent), color-mix(in srgb, var(--u-text) 4%, transparent)), color-mix(in srgb, var(--brand-bg) 82%, transparent)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      backdropFilter: 'blur(14px) saturate(140%)',
      borderBottom: '1px solid var(--u-hair)',
      position: 'sticky', top: 0, zIndex: 200,
    }}>
      <div className="waiter-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        {onBack ? (
          <button type="button" onClick={onBack} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="chevronLeft" size={20} />
          </button>
        ) : onAdminBack ? (
          <button type="button" onClick={onAdminBack} className="press glass-quiet" style={{ height: 36, padding: '0 12px', borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--u-text-3)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            <Icon name="chevronLeft" size={15} />
            Panel
          </button>
        ) : null}
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
        <HeaderMenu isOperatorSession={isOperatorSession} />
      </div>
    </header>
  );
}

/* ── Panel principal ──────────────────────────────────────── */
type View = 'tables' | 'menu' | 'review' | 'orders' | 'bill';

export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders, occupiedSince,
  tableCount, tipEnabled, tipPercent, currency, floorPlan,
  hubUrl, hubToken, isOperatorSession = false, voidApprovers = [],
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>('tables');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [tableToFree, setTableToFree] = useState<number | null>(null);
  const [freeing, startFree] = useTransition();
  const [productModal, setProductModal] = useState<Product | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [, startStatus] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  // Pedidos sin sincronizar con la nube (fallback offline, ver handleSubmit).
  const [queuedCount, setQueuedCount] = useState(0);
  const retryingQueueRef = useRef(false);

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
      const idx = prev.findIndex(
        (l) => l.productId === line.productId &&
          JSON.stringify(l.options) === JSON.stringify(line.options),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
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

  function handleProductTap(product: Product) {
    const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
    if (groups.length === 0) {
      addToCart({ lineId: newLineId(product.id), productId: product.id, name: product.name, price: product.price, quantity: 1, options: [] });
    } else {
      setProductModal(product);
    }
  }

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const tipAmount = tipEnabled && subtotal > 0 ? Math.round(subtotal * tipPercent) / 100 : 0;
  const total = subtotal + tipAmount;

  function resetOrder() {
    setCart([]);
    setGuestName('');
    setNotes('');
    setTableNumber(null);
    setSubmitError(null);
  }

  /* Selecciona una mesa: ocupada → diálogo; libre → al menú. */
  function selectTable(n: number) {
    if (occupiedSet.has(n)) { setTableToFree(n); }
    else { setTableNumber(n); setSearch(''); setView('menu'); }
  }

  async function handleSubmit() {
    if (!tableNumber) { setSubmitError('Selecciona la mesa primero.'); return; }
    if (cart.length === 0) { setSubmitError('El carrito está vacío.'); return; }
    setSubmitError(null);

    const finalName = guestName.trim() || `Mesa ${tableNumber}`;
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
      })),
      customer: {
        name: finalName,
        phone: '',
        type: 'DINE_IN' as const,
        tableNumber,
        notes: notes.trim() || undefined,
      },
      tipAccepted: tipEnabled && subtotal > 0,
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
  const query = search.trim().toLowerCase();
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
    onAdminBack: () => router.push('/admin'),
    showOrders: view !== 'orders',
    ordersCount: orders.length,
    onShowOrders: () => setView('orders'),
    isOperatorSession,
  };

  /* ════════════════ VISTA: MIS PEDIDOS ════════════════ */
  if (view === 'orders') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title="Mis pedidos" onBack={() => setView(tableNumber ? 'menu' : 'tables')} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="waiter-wrap-narrow" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" onClick={() => { setView('tables'); }} className="press btn-accent" style={{ padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
              ＋ Nuevo pedido
            </button>
            {queuedCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-warn, #f59e0b) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 30%, transparent)', color: 'var(--c-warn, #f59e0b)', fontSize: 13, fontWeight: 600 }}>
                <Icon name="clock" size={15} />
                {queuedCount === 1 ? '1 pedido sin sincronizar — se enviará solo al volver la señal.' : `${queuedCount} pedidos sin sincronizar — se enviarán solos al volver la señal.`}
              </div>
            )}
            {statusError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-danger, #f87171) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)', color: 'var(--c-danger, #f87171)', fontSize: 13, fontWeight: 600 }}>
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
              const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCEL' || order.status === 'SERVED';
              return (
                <div key={order.id} className="glass" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, opacity: isTerminal ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="t-mono" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{order.order_number}</span>
                        <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[order.status]}22`, color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}44` }}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginTop: 3 }}>{order.customer_name}</div>
                      {order.address && <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="grid" size={12} /> {order.address}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--u-text)' }}>
                        {money(Number(order.total), currency)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>
                        {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
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
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--c-danger, #f87171)', fontWeight: 600 }}>
                                {voidedQty} anulada{voidedQty === 1 ? '' : 's'}
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
                                style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--c-danger, #f87171)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
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
                        style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 8%, transparent)', color: 'var(--c-danger, #f87171)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
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
            voidApprovers={voidApprovers}
            onClose={() => setVoidTarget(null)}
            onDone={() => { setVoidTarget(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: ELEGIR MESA ════════════════ */
  if (view === 'tables') {
    // Mesas colocadas en el nivel activo (si el plano está habilitado).
    const planTables = planEnabled
      ? (floorPlan?.tables ?? []).filter((t) => t.level === activeLevel && t.n <= tableCount)
      : [];
    const placedNums = new Set((floorPlan?.tables ?? []).filter((t) => t.n <= tableCount).map((t) => t.n));
    const otherTables = planEnabled
      ? Array.from({ length: tableCount }, (_, i) => i + 1).filter((n) => !placedNums.has(n))
      : [];

    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={restaurantName} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="waiter-wrap" style={{ padding: '18px 16px 40px' }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Paso 1 de 3</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)', marginBottom: 4 }}>Elige la mesa</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', border: '1px solid var(--u-hair)' }} /> Libre
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(251,191,36,0.25)', border: '1px solid rgba(251,191,36,0.5)' }} /> Con pedido activo
              </span>
            </div>

            {abandonedCount > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 14, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)' }}>
                <Icon name="alertCircle" size={16} style={{ color: 'var(--c-danger, #f87171)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger, #f87171)' }}>
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
                <FloorMap tables={planTables} occupied={occupiedSet} occupiedSince={occupiedSince} now={now} onSelect={selectTable} />

                {/* Otras mesas (sin ubicar en el plano) */}
                {otherTables.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Otras mesas</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                      {otherTables.map((n) => (
                        <TableToken key={n} n={n} occupied={occupiedSet.has(n)} since={occupiedSince[n]?.since} waiterName={occupiedSince[n]?.waiterName} now={now} onTap={() => selectTable(n)} style={{ aspectRatio: '1 / 1' }} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 12 }}>
                {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => (
                  <TableToken key={n} n={n} occupied={occupiedSet.has(n)} since={occupiedSince[n]?.since} waiterName={occupiedSince[n]?.waiterName} now={now} onTap={() => selectTable(n)} style={{ aspectRatio: '1 / 1' }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Diálogo: opciones para mesa ocupada */}
        {tableToFree !== null && (
          <div onClick={() => setTableToFree(null)} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
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
                <button onClick={() => setTableToFree(null)} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
                  <Icon name="x" size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => { setTableToFree(null); setTableNumber(tableToFree); setSearch(''); setView('menu'); }}
                  className="press btn-accent"
                  style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
                >
                  ＋ Agregar platos
                </button>
                <button
                  type="button"
                  onClick={() => { const n = tableToFree!; setTableToFree(null); loadTableBill(n); setView('bill'); }}
                  className="press glass-quiet"
                  style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}
                >
                  <Icon name="list" size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} /> Ver cuenta / dividir
                </button>
                <button
                  type="button"
                  disabled={freeing}
                  onClick={() => {
                    const n = tableToFree!;
                    startFree(async () => {
                      const res = await freeTable(restaurantId, n);
                      if (res.error) { alert(res.error); }
                      setTableToFree(null);
                      router.refresh();
                    });
                  }}
                  className="press"
                  style={{ padding: '14px', borderRadius: 14, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 30%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 8%, transparent)', color: 'var(--c-danger, #f87171)', cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: freeing ? 0.6 : 1 }}
                >
                  {freeing ? 'Liberando…' : <><Icon name="check" size={15} strokeWidth={2.6} style={{ display: 'inline', verticalAlign: '-2px' }} /> Marcar como libre</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: CUENTA DE MESA / DIVIDIR ════════════════ */
  if (view === 'bill') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={`Cuenta · Mesa ${billTable}`} onBack={() => { setView('tables'); setBillTable(null); setBillOrders(null); }} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="waiter-wrap-narrow" style={{ padding: '16px' }}>
            {billLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)' }}>Cargando cuenta…</div>
            )}
            {billError && (
              <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)', padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)' }}>{billError}</div>
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
            voidApprovers={voidApprovers}
            onClose={() => setVoidTarget(null)}
            onDone={() => { setVoidTarget(null); if (billTable) loadTableBill(billTable); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: REVISAR Y ENVIAR ════════════════ */
  if (view === 'review') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={`Revisar · Mesa ${tableNumber}`} onBack={() => setView('menu')} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="waiter-wrap-narrow" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Orden ({cartCount})</div>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                  Aún no agregaste platos. <button type="button" onClick={() => setView('menu')} style={{ color: 'var(--brand-accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Volver al menú</button>
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
                        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>{money(line.price, currency)} c/u</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={`Mesa ${tableNumber}`} style={inputStyle} />
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
          <div className="waiter-wrap-narrow" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tipEnabled && tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Subtotal</span>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{money(subtotal, currency)}</span>
              </div>
            )}
            {tipEnabled && tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Propina ({tipPercent}%)</span>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{money(tipAmount, currency)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, color: 'var(--u-text-2)', fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)' }}>{money(total, currency)}</span>
            </div>
            {submitError && <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)', padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 20%, transparent)' }}>{submitError}</div>}
            {submitOk && <div style={{ fontSize: 13, color: 'var(--c-ok, #4ade80)', padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--c-ok, #4ade80) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-ok, #4ade80) 20%, transparent)' }}>{submitOk}</div>}
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
          <ProductOptionsModal product={productModal} currency={currency} onAdd={addToCart} onClose={() => setProductModal(null)} />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: MENÚ (agregar platos) ════════════════ */
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
      <WaiterHeader {...headerProps} title={`Mesa ${tableNumber}`} onBack={() => setView('tables')} />

      {/* Buscador */}
      <div className="waiter-wrap" style={{ width: '100%', padding: '12px 16px 6px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-4)', display: 'grid', placeItems: 'center' }}>
            <Icon name="search" size={17} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plato…"
            style={{ ...inputStyle, paddingLeft: 40, paddingRight: search ? 40 : 14 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Categorías (ocultas al buscar) */}
      {!query && (
        <div className="waiter-wrap" style={{ width: '100%', display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 16px 10px', flexShrink: 0, scrollbarWidth: 'none' }}>
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
        <div className="waiter-wrap" style={{ padding: '4px 16px 96px' }}>
          {visibleProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
              {query ? 'Ningún plato coincide con tu búsqueda.' : 'Sin productos disponibles en esta categoría.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 12 }}>
              {visibleProducts.map((p) => {
                const qty = cartQtyOf(p.id);
                const hasOptions = ((p.options as ProductOptionGroup[] | null) ?? []).length > 0;
                return (
                  <div
                    key={p.id}
                    className="glass"
                    style={{
                      borderRadius: 14, padding: '12px 12px 10px', position: 'relative',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      border: qty > 0 ? '1.5px solid var(--brand-accent)' : '1.5px solid transparent',
                    }}
                  >
                    {qty > 0 && (
                      <span style={{ position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 99, background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)', fontSize: 12.5, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                        {qty}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleProductTap(p)}
                      className="press"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--u-text)' }}
                    >
                      {p.icon && (
                        ICON_PATHS[p.icon]
                          ? <Icon name={p.icon} size={22} />
                          : <span style={{ fontSize: 22 }}>{p.icon}</span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, paddingRight: qty > 0 ? 22 : 0 }}>{p.name}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-accent)' }}>{money(p.price, currency)}</span>
                    </button>

                    {/* Controles rápidos: +/- para productos sin opciones; "+ Agregar" para los que tienen */}
                    {hasOptions ? (
                      <button type="button" onClick={() => setProductModal(p)} className="press" style={{ marginTop: 2, padding: '8px', borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                        {qty > 0 ? 'Agregar otro' : '+ Elegir opciones'}
                      </button>
                    ) : qty > 0 ? (
                      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => decProduct(p.id)} className="press" style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                        <button type="button" onClick={() => handleProductTap(p)} className="press" style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => handleProductTap(p)} className="press" style={{ marginTop: 2, padding: '8px', borderRadius: 10, border: 'none', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
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

      {/* Barra flotante del carrito → Revisar */}
      {cartCount > 0 && (
        <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(to top, var(--brand-bg) 60%, transparent)', flexShrink: 0 }}>
          <div className="waiter-wrap" style={{ padding: '12px 16px' }}>
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
        <ProductOptionsModal product={productModal} currency={currency} onAdd={addToCart} onClose={() => setProductModal(null)} />
      )}
    </div>
  );
}
