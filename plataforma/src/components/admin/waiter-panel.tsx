'use client';

/* WaiterPanel — interfaz táctil para meseros.
   Flujo guiado en 3 pasos: Mesa → Menú → Revisar, + tab "Mis pedidos".
   Diseñado para minimizar errores: mesa siempre visible, buscador,
   contador por plato y mesas ocupadas marcadas. */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import { createWaiterOrder } from '@/lib/actions/orders';
import { updateOrderStatus } from '@/lib/actions/orders';
import type { Category, Product, ProductOptionGroup, ProductOptionChoice } from '@/types';
import type { OrderWithItems } from '@/lib/db/orders';
import type { PanelCurrency } from '@/components/admin/order-card';

/* ── Tipos locales ────────────────────────────────────────── */
interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  options: { groupId: string; groupName: string; choiceId: string; choiceName: string; priceDelta: number }[];
}

interface Props {
  waiterId: string;
  waiterName: string;
  restaurantId: string;
  restaurantName: string;
  categories: Category[];
  products: Product[];
  initialOrders: OrderWithItems[];
  occupiedTables: number[];
  tableCount: number;
  tipEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
}

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
  NEW: 'Nuevo', PREP: 'Preparando', READY: 'Listo', TRANSIT: 'En camino', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  NEW: '#3b82f6', PREP: '#f59e0b', READY: '#8b5cf6', TRANSIT: '#f97316', DELIVERED: '#22c55e', CANCEL: '#6b7280',
};

function nextStatus(status: string, _type: string): string | null {
  if (status === 'NEW') return 'PREP';
  if (status === 'PREP') return 'READY';
  if (status === 'READY') return 'DELIVERED';
  return null;
}
function nextLabel(status: string): string {
  if (status === 'NEW') return 'Confirmar';
  if (status === 'PREP') return 'Marcar listo';
  if (status === 'READY') return 'Servir en mesa';
  return '';
}

/* ── Modal de opciones del producto ─────────────────────────── */
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
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());
  const [qty, setQty] = useState(1);

  function toggleChoice(group: ProductOptionGroup, choice: ProductOptionChoice) {
    setSelected((prev) => {
      const map = new Map(prev);
      const set = new Set(map.get(group.id) ?? []);
      if (group.type === 'single') {
        map.set(group.id, new Set([choice.id]));
      } else {
        if (set.has(choice.id)) { set.delete(choice.id); } else { set.add(choice.id); }
        map.set(group.id, set);
      }
      return map;
    });
  }

  function isSelected(groupId: string, choiceId: string): boolean {
    return selected.get(groupId)?.has(choiceId) ?? false;
  }

  function buildOptions() {
    const opts: CartLine['options'] = [];
    for (const group of groups) {
      const ids = selected.get(group.id) ?? new Set();
      for (const choiceId of ids) {
        const choice = group.choices.find((c) => c.id === choiceId);
        if (choice) {
          opts.push({ groupId: group.id, groupName: group.name, choiceId: choice.id, choiceName: choice.name, priceDelta: choice.priceDelta });
        }
      }
    }
    return opts;
  }

  function validate(): string | null {
    for (const group of groups) {
      if (group.type === 'single' && group.required) {
        if (!selected.get(group.id)?.size) return `Elige "${group.name}"`;
      }
    }
    return null;
  }

  function handleAdd() {
    const err = validate();
    if (err) { alert(err); return; }
    const opts = buildOptions();
    const deltaTotal = opts.reduce((s, o) => s + o.priceDelta, 0);
    for (let i = 0; i < qty; i++) {
      onAdd({
        lineId: newLineId(product.id),
        productId: product.id,
        name: product.name,
        price: product.price + deltaTotal,
        quantity: 1,
        options: opts,
      });
    }
    onClose();
  }

  const deltaTotal = buildOptions().reduce((s, o) => s + o.priceDelta, 0);
  const finalPrice = product.price + deltaTotal;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(7,7,8,0.7)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center' }}>
      <div className="glass-solid anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '96vw', maxHeight: '88vh', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--u-hair)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="t-display" style={{ fontSize: 18 }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>{money(finalPrice, currency)} por unidad</div>
          </div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map((group) => (
            <div key={group.id}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                {group.name} {group.required && <span style={{ color: '#f87171' }}>*</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.choices.map((choice) => {
                  const on = isSelected(group.id, choice.id);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => toggleChoice(group, choice)}
                      className="press"
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--u-hair)'}`,
                        background: on ? 'rgba(var(--color-accent-rgb),0.12)' : 'rgba(255,255,255,0.03)',
                        color: 'var(--u-text)',
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{choice.name}</span>
                      {choice.priceDelta !== 0 && (
                        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
                          {choice.priceDelta > 0 ? '+' : ''}{money(choice.priceDelta, currency)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Cantidad */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Cantidad</div>
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
    <header style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--u-hair)',
      position: 'sticky', top: 0, zIndex: 200,
    }}>
      {onBack && (
        <button type="button" onClick={onBack} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
          <Icon name="chevronLeft" size={20} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 1 }}>🙋 {waiterName}</div>
      </div>
      {showOrders ? (
        <button type="button" onClick={onShowOrders} className="press glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          📋 Pedidos{ordersCount > 0 ? ` (${ordersCount})` : ''}
        </button>
      ) : (
        <LogoutButton />
      )}
    </header>
  );
}

/* ── Panel principal ──────────────────────────────────────── */
type View = 'tables' | 'menu' | 'review' | 'orders';

export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders, occupiedTables,
  tableCount, tipEnabled, tipPercent, currency,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>('tables');
  const [activeCat, setActiveCat] = useState<string | null>(categories[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [tipAccepted, setTipAccepted] = useState(false);
  const [productModal, setProductModal] = useState<Product | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [, startStatus] = useTransition();

  // Realtime: actualiza mis pedidos cuando hay cambios.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase
        .channel(`waiter-orders-${waiterId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
          router.refresh();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
          router.refresh();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [waiterId, router]);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const occupiedSet = useMemo(() => new Set(occupiedTables), [occupiedTables]);

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
  const tipAmount = tipEnabled && tipAccepted ? Math.round(subtotal * tipPercent) / 100 : 0;
  const total = subtotal + tipAmount;

  function resetOrder() {
    setCart([]);
    setGuestName('');
    setNotes('');
    setTipAccepted(false);
    setTableNumber(null);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!tableNumber) { setSubmitError('Selecciona la mesa primero.'); return; }
    if (cart.length === 0) { setSubmitError('El carrito está vacío.'); return; }
    setSubmitError(null);

    const finalName = guestName.trim() || `Mesa ${tableNumber}`;

    const input = {
      restaurantId,
      items: cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        options: l.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId })),
      })),
      customer: {
        name: finalName,
        phone: '',
        type: 'DINE_IN' as const,
        tableNumber,
        notes: notes.trim() || undefined,
      },
      tipAccepted,
    };

    startSubmit(async () => {
      const result = await createWaiterOrder(input);
      if (result.error) {
        setSubmitError(result.error);
      } else {
        setSubmitOk(`Pedido ${result.orderNumber} enviado a cocina.`);
        resetOrder();
        setTimeout(() => { setSubmitOk(null); setView('orders'); }, 1600);
        router.refresh();
      }
    });
  }

  /* ── Filtrado de productos ───────────────────────────── */
  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter((p) => {
    if (!p.is_available || !p.is_active) return false;
    if (query) return p.name.toLowerCase().includes(query);
    return p.category_id === activeCat;
  });

  /* ── UI compartida ───────────────────────────────────── */
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
    borderRadius: 12, padding: '12px 14px', color: 'var(--u-text)', fontSize: 15, outline: 'none', width: '100%',
  };

  const headerProps = {
    waiterName,
    showOrders: view !== 'orders',
    ordersCount: orders.length,
    onShowOrders: () => setView('orders'),
  };

  /* ════════════════ VISTA: MIS PEDIDOS ════════════════ */
  if (view === 'orders') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title="Mis pedidos" onBack={() => setView(tableNumber ? 'menu' : 'tables')} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" onClick={() => { setView('tables'); }} className="press btn-accent" style={{ padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            ＋ Nuevo pedido
          </button>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--u-text-4)', fontSize: 15 }}>
              Sin pedidos activos. Tus pedidos en curso aparecerán aquí.
            </div>
          ) : orders.map((order) => {
            const next = nextStatus(order.status, order.order_type);
            const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCEL';
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
                    {order.address && <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>🪑 {order.address}</div>}
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
                  {order.items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--u-text-2)' }}>
                      <span>{item.quantity}× {item.name_snapshot}</span>
                      <span style={{ fontWeight: 600 }}>{money(Number(item.subtotal), currency)}</span>
                    </div>
                  ))}
                </div>

                {!isTerminal && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {next && (
                      <button
                        type="button"
                        onClick={() => startStatus(async () => {
                          await updateOrderStatus(order.id, next as import('@/types').OrderStatus);
                          router.refresh();
                        })}
                        className="press btn-accent"
                        style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                      >
                        {nextLabel(order.status)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('¿Cancelar este pedido?')) {
                          startStatus(async () => {
                            await updateOrderStatus(order.id, 'CANCEL');
                            router.refresh();
                          });
                        }
                      }}
                      className="press"
                      style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
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
    );
  }

  /* ════════════════ VISTA: ELEGIR MESA ════════════════ */
  if (view === 'tables') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={restaurantName} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Paso 1 de 3</div>
          <div className="t-display" style={{ fontSize: 24, marginBottom: 4 }}>Elige la mesa</div>
          <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.1)', border: '1px solid var(--u-hair)' }} /> Libre
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(251,191,36,0.25)', border: '1px solid rgba(251,191,36,0.5)' }} /> Con pedido activo
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 10 }}>
            {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => {
              const occupied = occupiedSet.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setTableNumber(n); setSearch(''); setView('menu'); }}
                  className="press"
                  style={{
                    aspectRatio: '1 / 1', borderRadius: 16, cursor: 'pointer',
                    border: `1.5px solid ${occupied ? 'rgba(251,191,36,0.5)' : 'var(--u-hair)'}`,
                    background: occupied ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                    color: occupied ? '#fbbf24' : 'var(--u-text)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 11, color: occupied ? 'rgba(251,191,36,0.8)' : 'var(--u-text-4)', fontWeight: 600 }}>Mesa</span>
                  <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{n}</span>
                  {occupied && <span style={{ fontSize: 9.5, fontWeight: 700, marginTop: 2 }}>● activa</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════ VISTA: REVISAR Y ENVIAR ════════════════ */
  if (view === 'review') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={`Revisar · Mesa ${tableNumber}`} onBack={() => setView('menu')} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Orden ({cartCount})</div>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                Aún no agregaste platos. <button type="button" onClick={() => setView('menu')} style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Volver al menú</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cart.map((line) => (
                  <div key={line.lineId} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--u-text)', fontWeight: 600 }}>{line.name}</div>
                      {line.options.length > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>{line.options.map((o) => o.choiceName).join(', ')}</div>
                      )}
                      <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>{money(line.price, currency)} c/u</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button type="button" onClick={() => decLine(line.lineId)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                      <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{line.quantity}</span>
                      <button type="button" onClick={() => incLine(line)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
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

          {tipEnabled && subtotal > 0 && (
            <button
              type="button"
              onClick={() => setTipAccepted((v) => !v)}
              className="press"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${tipAccepted ? 'var(--color-accent)' : 'var(--u-hair)'}`,
                background: tipAccepted ? 'rgba(var(--color-accent-rgb),0.1)' : 'rgba(255,255,255,0.03)',
                color: 'var(--u-text)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18 }}>🙏</span>
              <span style={{ flex: 1, fontSize: 14 }}>Propina sugerida ({tipPercent}%) — {money(Math.round(subtotal * tipPercent) / 100, currency)}</span>
              <span style={{ fontSize: 14, color: tipAccepted ? 'var(--color-accent)' : 'var(--u-text-4)', fontWeight: 700 }}>{tipAccepted ? '✓' : '+'}</span>
            </button>
          )}
        </div>

        {/* Barra fija inferior: total + enviar */}
        <div style={{ borderTop: '1px solid var(--u-hair)', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, color: 'var(--u-text-2)', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)' }}>{money(total, currency)}</span>
          </div>
          {submitError && <div style={{ fontSize: 13, color: '#f87171', padding: '8px 12px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>{submitError}</div>}
          {submitOk && <div style={{ fontSize: 13, color: '#4ade80', padding: '8px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>{submitOk}</div>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0}
            className="press btn-accent"
            style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: submitting || cart.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: submitting || cart.length === 0 ? 0.6 : 1 }}
          >
            {submitting ? 'Enviando…' : '🛎 Enviar a cocina'}
          </button>
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
      <div style={{ padding: '12px 14px 6px', flexShrink: 0 }}>
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
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Categorías (ocultas al buscar) */}
      {!query && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 14px 10px', flexShrink: 0, scrollbarWidth: 'none' }}>
          {categories.filter((c) => c.is_active).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className="press"
              style={{
                whiteSpace: 'nowrap', padding: '9px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
                background: activeCat === cat.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.07)',
                color: activeCat === cat.id ? 'var(--on-accent)' : 'var(--u-text-2)',
                flexShrink: 0,
              }}
            >
              {cat.icon ? `${cat.icon} ` : ''}{cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Productos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 96px' }}>
        {visibleProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
            {query ? 'Ningún plato coincide con tu búsqueda.' : 'Sin productos disponibles en esta categoría.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
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
                    border: qty > 0 ? '1.5px solid var(--color-accent)' : '1.5px solid transparent',
                  }}
                >
                  {qty > 0 && (
                    <span style={{ position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 99, background: 'var(--color-accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                      {qty}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleProductTap(p)}
                    className="press"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--u-text)' }}
                  >
                    {p.icon && <span style={{ fontSize: 22 }}>{p.icon}</span>}
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, paddingRight: qty > 0 ? 22 : 0 }}>{p.name}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-accent)' }}>{money(p.price, currency)}</span>
                  </button>

                  {/* Controles rápidos: +/- para productos sin opciones; "+ Agregar" para los que tienen */}
                  {hasOptions ? (
                    <button type="button" onClick={() => setProductModal(p)} className="press" style={{ marginTop: 2, padding: '8px', borderRadius: 10, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                      {qty > 0 ? 'Agregar otro' : '+ Elegir opciones'}
                    </button>
                  ) : qty > 0 ? (
                    <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" onClick={() => decProduct(p.id)} className="press" style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                      <button type="button" onClick={() => handleProductTap(p)} className="press" style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => handleProductTap(p)} className="press" style={{ marginTop: 2, padding: '8px', borderRadius: 10, border: 'none', background: 'rgba(var(--color-accent-rgb),0.14)', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
                      + Agregar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra flotante del carrito → Revisar */}
      {cartCount > 0 && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 14px', background: 'linear-gradient(to top, var(--brand-bg) 60%, transparent)', flexShrink: 0 }}>
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
      )}

      {productModal && (
        <ProductOptionsModal product={productModal} currency={currency} onAdd={addToCart} onClose={() => setProductModal(null)} />
      )}
    </div>
  );
}
