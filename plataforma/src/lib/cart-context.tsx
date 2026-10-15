'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { CartItem, CartItemOption } from '@/types';

/** Línea única por producto+opciones: "Pizza (grande, extra queso)" ≠ "Pizza (mediana)". */
export function buildLineId(productId: string, options?: CartItemOption[], rewardId?: string): string {
  // Las recompensas son una línea propia por recompensa (no se apilan con su
  // versión pagada del mismo producto, ni entre sí más de una vez).
  if (rewardId) return `reward:${rewardId}`;
  if (!options?.length) return productId;
  const sig = options
    .map((o) => `${o.groupId}:${o.choiceId}${o.variantId ? `:${o.variantId}` : ''}`)
    .sort()
    .join('|');
  return `${productId}__${sig}`;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity' | 'lineId'>, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
  /** Unidades totales de un producto sumando todas sus variantes. */
  qtyOfProduct: (productId: string) => number;
  /** Total de puntos que costarán las recompensas en el carrito. */
  pointsToRedeem: number;
  /** ¿Hay alguna recompensa en el carrito? */
  hasRewards: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Carritos guardados antes de las variantes no traen lineId. */
function migrate(stored: unknown): CartItem[] {
  if (!Array.isArray(stored)) return [];
  return (stored as Partial<CartItem>[])
    .filter((i) => i && typeof i.productId === 'string' && typeof i.price === 'number')
    .map((i) => ({
      lineId: i.lineId ?? buildLineId(i.productId!, i.options, i.rewardId),
      productId: i.productId!,
      name: i.name ?? '',
      price: i.price!,
      quantity: i.rewardId ? 1 : Math.max(1, Number(i.quantity) || 1),
      image_url: i.image_url ?? null,
      options: i.options,
      ...(i.rewardId ? { rewardId: i.rewardId, pointsCost: Number(i.pointsCost) || 0 } : {}),
    }));
}

const cartKey = (restaurantId: string) => `cart-${restaurantId}`;

/**
 * ¿Quedó algo en el carrito guardado de este restaurante? Lee el almacén
 * directamente, sin esperar a que el proveedor se rehidrate: el menú lo
 * pregunta al montar para decidir si reabre el carrito al volver del pago, y
 * a esa altura `items` todavía es []. Tras pedir, el carrito se vacía y
 * reabrirlo solo enseñaría «tu carrito está vacío».
 */
export function carritoGuardadoTieneAlgo(restaurantId: string): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem(cartKey(restaurantId)) ?? '[]');
    return Array.isArray(stored) && stored.length > 0;
  } catch {
    return false;
  }
}

export function CartProvider({
  children,
  restaurantId,
}: {
  children: React.ReactNode;
  restaurantId: string;
}) {
  const key = cartKey(restaurantId);
  const [items, setItems] = useState<CartItem[]>([]);

  // Rehidratar desde localStorage una sola vez al montar.
  // Intencional: el estado inicial debe ser [] en el servidor (SSR) y
  // llenarse solo en el cliente, para evitar mismatch de hidratación.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);

      if (stored) setItems(migrate(JSON.parse(stored)));
    } catch {}
  }, [key]);

  const save = (next: CartItem[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    return next;
  };

  const addItem = useCallback((item: Omit<CartItem, 'quantity' | 'lineId'>, quantity = 1) => {
    const lineId = buildLineId(item.productId, item.options, item.rewardId);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      // Una recompensa solo puede estar una vez (cantidad fija 1): si ya está, no-op.
      if (existing && item.rewardId) return prev;
      return save(
        existing
          ? prev.map((i) =>
              i.lineId === lineId
                ? { ...i, quantity: i.quantity + quantity }
                : i,
            )
          : [...prev, { ...item, lineId, quantity: item.rewardId ? 1 : quantity }],
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => save(prev.filter((i) => i.lineId !== lineId)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((prev) =>
      save(
        quantity <= 0
          ? prev.filter((i) => i.lineId !== lineId)
          : prev.map((i) =>
              i.lineId === lineId ? { ...i, quantity } : i,
            ),
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const clearCart = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(key); } catch {}
  }, [key]);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const pointsToRedeem = items.reduce((sum, i) => sum + (i.rewardId ? (i.pointsCost ?? 0) : 0), 0);
  const hasRewards = items.some((i) => i.rewardId);

  const qtyOfProduct = useCallback(
    (productId: string) =>
      items.reduce((sum, i) => (i.productId === productId ? sum + i.quantity : sum), 0),
    [items],
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count, qtyOfProduct, pointsToRedeem, hasRewards }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
