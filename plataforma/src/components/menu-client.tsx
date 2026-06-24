'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Catalog from '@/components/menu/catalog';
import ProductSheet from '@/components/menu/product-sheet';
import { CartBar, CartPanel } from '@/components/menu/cart';
import ActiveOrderChip from '@/components/active-order-chip';
import WaiterCallButton from '@/components/menu/waiter-call-button';
import { useCart } from '@/lib/cart-context';
import { getScannedTable } from '@/lib/table-session';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'> & {
  is_available?: boolean | null;
  unavailable_at?: string | null;
};

interface Props {
  categories: CatItem[];
  products: ProdItem[];
  ordersEnabled?: boolean;
  restaurantId?: string;
  llamadaMeseroEnabled?: boolean;
  /** Mesa que llegó por ?mesa=N (QR de mesa). */
  initialMesa?: number;
}

/** ¿El producto tiene variantes/extras que el comensal debe ver? */
function hasOptions(p: ProdItem): boolean {
  return Array.isArray(p.options) && p.options.some((g) => g.choices?.length > 0);
}

export default function MenuClient({ categories, products, ordersEnabled = false, restaurantId, llamadaMeseroEnabled = false, initialMesa }: Props) {
  const { items, addItem, qtyOfProduct } = useCart();
  const [selected, setSelected] = useState<ProdItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const cartIconRef = useRef<HTMLButtonElement | null>(null);

  // El comensal "está en una mesa" solo si escaneó el QR de su mesa.
  const [tableScanned, setTableScanned] = useState(false);
  useEffect(() => {
    if (!restaurantId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableScanned((initialMesa != null && initialMesa > 0) || getScannedTable(restaurantId) !== null);
  }, [initialMesa, restaurantId]);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const catIcon = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.icon?.trim() ? c.icon : 'utensils');
    return m;
  }, [categories]);

  /* Punto que "vuela" del botón al ícono del carrito. */
  function fly(fromEl: HTMLElement) {
    const target = cartIconRef.current;
    if (!fromEl || !target) return;
    const a = fromEl.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: `${a.left + a.width / 2 - 9}px`, top: `${a.top + a.height / 2 - 9}px`,
      width: '18px', height: '18px', borderRadius: '50%', zIndex: '9999', pointerEvents: 'none',
      background: 'radial-gradient(circle at 35% 30%, #fff, #cbc8c0)', boxShadow: '0 4px 14px rgba(255,255,255,0.4)',
    } as CSSStyleDeclaration);
    document.body.appendChild(dot);
    dot.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${(b.left + b.width / 2 - a.left - a.width / 2) * 0.5}px, ${(a.top - b.top) * -0.3 - 60}px) scale(1.3)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.2)`, opacity: 0.5 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.5,0,0.3,1)' },
    ).onfinish = () => dot.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(0.16,1,0.3,1)' });
  }

  function onAdd(product: ProdItem, sourceEl: HTMLElement) {
    // Con variantes el "+" abre la hoja para elegir; sin variantes agrega directo.
    if (hasOptions(product)) {
      setCartOpen(false);
      setSelected(product);
      return;
    }
    addItem({ productId: product.id, name: product.name, price: product.price, image_url: product.image_url });
    fly(sourceEl);
  }

  return (
    <>
      <Catalog
        categories={categories}
        products={products}
        ordersEnabled={ordersEnabled}
        qtyOf={qtyOfProduct}
        onAdd={onAdd}
        onOpen={(p) => { setCartOpen(false); setSelected(p); }}
        cartCount={count}
        onOpenCart={() => setCartOpen(true)}
        cartIconRef={cartIconRef}
      />

      {ordersEnabled && <div style={{ height: count > 0 ? 88 : 24 }} />}

      {selected && (
        <ProductSheet
          product={selected}
          icon={selected.icon || catIcon.get(selected.category_id ?? '') || 'utensils'}
          ordersEnabled={ordersEnabled}
          onClose={() => setSelected(null)}
        />
      )}

      {ordersEnabled && <CartBar onOpen={() => setCartOpen(true)} />}
      {ordersEnabled && cartOpen && <CartPanel onClose={() => setCartOpen(false)} />}
      {ordersEnabled && restaurantId && !selected && !cartOpen && (
        <ActiveOrderChip restaurantId={restaurantId} />
      )}

      {/* FAB "Llamar al mesero" — solo si el módulo está activo Y se escaneó el QR de mesa */}
      {llamadaMeseroEnabled && restaurantId && tableScanned && !selected && !cartOpen && (
        <WaiterCallButton restaurantId={restaurantId} raised={ordersEnabled && count > 0} />
      )}
    </>
  );
}
