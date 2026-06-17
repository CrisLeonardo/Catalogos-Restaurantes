'use client';

/* WaiterPanel — interfaz táctil para meseros (migración 030).
   Dos tabs: "Nuevo pedido" (carrito + formulario) y "Mis pedidos" (en curso). */

import { useEffect, useRef, useState, useTransition } from 'react';
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
  tableCount: number;
  tipEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
}

/* ── Helpers ──────────────────────────────────────────────── */
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
        lineId: `${product.id}-${Date.now()}-${i}`,
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

/* ── Panel principal ──────────────────────────────────────── */
export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders,
  tableCount, tipEnabled, tipPercent, currency,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'orders'>('new');
  const [activeCat, setActiveCat] = useState<string | null>(categories[0]?.id ?? null);
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
  const catScrollRef = useRef<HTMLDivElement>(null);

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

  /* ── Carrito ─────────────────────────────────────────── */
  function addToCart(line: CartLine) {
    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => l.productId === line.productId &&
          JSON.stringify(l.options) === JSON.stringify(line.options),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, line];
    });
  }

  function removeFromCart(lineId: string) {
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

  function handleProductTap(product: Product) {
    const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
    if (groups.length === 0) {
      addToCart({ lineId: `${product.id}-${Date.now()}`, productId: product.id, name: product.name, price: product.price, quantity: 1, options: [] });
    } else {
      setProductModal(product);
    }
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const tipAmount = tipEnabled && tipAccepted ? Math.round(subtotal * tipPercent) / 100 : 0;
  const total = subtotal + tipAmount;

  async function handleSubmit() {
    if (!tableNumber) { setSubmitError('Selecciona la mesa primero.'); return; }
    if (!guestName.trim()) { setSubmitError('Escribe el nombre del cliente o mesa.'); return; }
    if (cart.length === 0) { setSubmitError('El carrito está vacío.'); return; }
    setSubmitError(null);

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
        name: guestName.trim(),
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
        setCart([]);
        setGuestName('');
        setNotes('');
        setTableNumber(null);
        setTipAccepted(false);
        setTimeout(() => { setSubmitOk(null); setTab('orders'); }, 2000);
        router.refresh();
      }
    });
  }

  /* ── Filtrado de productos ───────────────────────────── */
  const visibleProducts = products.filter(
    (p) => p.is_available && p.is_active && p.category_id === activeCat,
  );

  /* ── UI ──────────────────────────────────────────────── */
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
    borderRadius: 12, padding: '11px 14px', color: 'var(--u-text)', fontSize: 14, outline: 'none', width: '100%',
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
      {/* Topbar */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--u-hair)',
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurantName}</div>
          <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 1 }}>🙋 {waiterName}</div>
        </div>
        <LogoutButton />
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
        {(['new', 'orders'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '14px 8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: 'transparent', color: tab === t ? 'var(--color-accent)' : 'var(--u-text-3)',
              borderBottom: `2px solid ${tab === t ? 'var(--color-accent)' : 'transparent'}`,
              transition: 'color 150ms, border-color 150ms',
            }}
          >
            {t === 'new' ? `🍽 Nuevo pedido${cart.length > 0 ? ` (${cart.reduce((s, l) => s + l.quantity, 0)})` : ''}` : `📋 Mis pedidos${orders.length > 0 ? ` (${orders.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'new' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Categorías */}
          <div ref={catScrollRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 14px', flexShrink: 0, scrollbarWidth: 'none' }}>
            {categories.filter((c) => c.is_active).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                className="press"
                style={{
                  whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  background: activeCat === cat.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.07)',
                  color: activeCat === cat.id ? 'var(--on-accent)' : 'var(--u-text-2)',
                  flexShrink: 0,
                }}
              >
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </button>
            ))}
          </div>

          {/* Productos */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 12px' }}>
            {visibleProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                Sin productos disponibles en esta categoría.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {visibleProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProductTap(p)}
                    className="press glass"
                    style={{
                      borderRadius: 14, padding: '14px 12px', border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
                    }}
                  >
                    {p.icon && <span style={{ fontSize: 22 }}>{p.icon}</span>}
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)', lineHeight: 1.3 }}>{p.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent)' }}>{money(p.price, currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Panel inferior: carrito + formulario */}
          <div style={{ borderTop: '1px solid var(--u-hair)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(16px)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto', flexShrink: 0 }}>
            {/* Mesa */}
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Mesa *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTableNumber(tableNumber === n ? null : n)}
                    className="press"
                    style={{
                      width: 44, height: 44, borderRadius: 11, border: `1px solid ${tableNumber === n ? 'var(--color-accent)' : 'var(--u-hair)'}`,
                      background: tableNumber === n ? 'rgba(var(--color-accent-rgb),0.2)' : 'rgba(255,255,255,0.04)',
                      color: tableNumber === n ? 'var(--color-accent)' : 'var(--u-text-3)',
                      cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre del cliente */}
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Nombre / referencia *</div>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ej. Familia García, Juan, Pareja"
                style={inputStyle}
              />
            </div>

            {/* Carrito */}
            {cart.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Orden</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cart.map((line) => (
                    <div key={line.lineId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" onClick={() => removeFromCart(line.lineId)} className="press" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text-3)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>−</button>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)', minWidth: 0 }}>
                        {line.quantity}× {line.name}
                        {line.options.length > 0 && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--u-text-4)' }}>
                            {line.options.map((o) => o.choiceName).join(', ')}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)', flexShrink: 0 }}>{money(line.price * line.quantity, currency)}</span>
                      <button type="button" onClick={() => addToCart({ ...line, lineId: `${line.productId}-${Date.now()}`, quantity: 1 })} className="press" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--u-hair)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text-3)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>+</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notas */}
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notas especiales</div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alergias, sin sal, extra salsa…"
                style={inputStyle}
              />
            </div>

            {/* Propina */}
            {tipEnabled && subtotal > 0 && (
              <button
                type="button"
                onClick={() => setTipAccepted((v) => !v)}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: `1px solid ${tipAccepted ? 'var(--color-accent)' : 'var(--u-hair)'}`,
                  background: tipAccepted ? 'rgba(var(--color-accent-rgb),0.1)' : 'rgba(255,255,255,0.03)',
                  color: 'var(--u-text)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18 }}>🙏</span>
                <span style={{ flex: 1, fontSize: 13 }}>Propina sugerida ({tipPercent}%) — {money(tipAmount || Math.round(subtotal * tipPercent) / 100, currency)}</span>
                <span style={{ fontSize: 13, color: tipAccepted ? 'var(--color-accent)' : 'var(--u-text-4)', fontWeight: 700 }}>{tipAccepted ? '✓' : '+'}</span>
              </button>
            )}

            {/* Total y enviar */}
            {cart.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, color: 'var(--u-text-2)', fontWeight: 600 }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--u-text)' }}>{money(total, currency)}</span>
                </div>
                {submitError && <div style={{ fontSize: 13, color: '#f87171', padding: '8px 12px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>{submitError}</div>}
                {submitOk && <div style={{ fontSize: 13, color: '#4ade80', padding: '8px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>{submitOk}</div>}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="press btn-accent"
                  style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? 'Enviando…' : '🛎 Enviar a cocina'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Tab: Mis pedidos ──────────────────────────── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--u-text-4)', fontSize: 15 }}>
              Sin pedidos activos. Tus pedidos en curso aparecerán aquí.
            </div>
          ) : orders.map((order) => {
            const next = nextStatus(order.status, order.order_type);
            const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCEL';
            return (
              <div key={order.id} className="glass" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, opacity: isTerminal ? 0.6 : 1 }}>
                {/* Header */}
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

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {order.items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--u-text-2)' }}>
                      <span>{item.quantity}× {item.name_snapshot}</span>
                      <span style={{ fontWeight: 600 }}>{money(Number(item.subtotal), currency)}</span>
                    </div>
                  ))}
                </div>

                {/* Acciones */}
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
                        style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}
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
                      style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de opciones */}
      {productModal && (
        <ProductOptionsModal
          product={productModal}
          currency={currency}
          onAdd={addToCart}
          onClose={() => setProductModal(null)}
        />
      )}
    </div>
  );
}
