'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { CartItem } from '@/types';

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

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
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, [key]);

  const save = (next: CartItem[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    return next;
  };

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      return save(
        existing
          ? prev.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + 1 }
                : i,
            )
          : [...prev, { ...item, quantity: 1 }],
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => save(prev.filter((i) => i.productId !== productId)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      save(
        quantity <= 0
          ? prev.filter((i) => i.productId !== productId)
          : prev.map((i) =>
              i.productId === productId ? { ...i, quantity } : i,
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

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count }}
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
