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
export function buildLineId(productId: string, options?: CartItemOption[]): string {
  if (!options?.length) return productId;
  const sig = options
    .map((o) => `${o.groupId}:${o.choiceId}`)
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
}

const CartContext = createContext<CartContextValue | null>(null);

/** Carritos guardados antes de las variantes no traen lineId. */
function migrate(stored: unknown): CartItem[] {
  if (!Array.isArray(stored)) return [];
  return (stored as Partial<CartItem>[])
    .filter((i) => i && typeof i.productId === 'string' && typeof i.price === 'number')
    .map((i) => ({
      lineId: i.lineId ?? buildLineId(i.productId!, i.options),
      productId: i.productId!,
      name: i.name ?? '',
      price: i.price!,
      quantity: Math.max(1, Number(i.quantity) || 1),
      image_url: i.image_url ?? null,
      options: i.options,
    }));
}

export function CartProvider({
  children,
  restaurantId,
}: {
  children: React.ReactNode;
  restaurantId: string;
}) {
  const key = `cart-${restaurantId}`;
  const [items, setItems] = useState<CartItem[]>([]);

  // Rehidratar desde localStorage una sola vez al montar.
  // Intencional: el estado inicial debe ser [] en el servidor (SSR) y
  // llenarse solo en el cliente, para evitar mismatch de hidratación.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setItems(migrate(JSON.parse(stored)));
    } catch {}
  }, [key]);

  const save = (next: CartItem[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    return next;
  };

  const addItem = useCallback((item: Omit<CartItem, 'quantity' | 'lineId'>, quantity = 1) => {
    const lineId = buildLineId(item.productId, item.options);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      return save(
        existing
          ? prev.map((i) =>
              i.lineId === lineId
                ? { ...i, quantity: i.quantity + quantity }
                : i,
            )
          : [...prev, { ...item, lineId, quantity }],
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

  const qtyOfProduct = useCallback(
    (productId: string) =>
      items.reduce((sum, i) => (i.productId === productId ? sum + i.quantity : sum), 0),
    [items],
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count, qtyOfProduct }}
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
