'use client';

import { useEffect, useMemo, useState } from 'react';
import Catalog from '@/components/menu/catalog';
import ProductSheet from '@/components/menu/product-sheet';
import { CartBar, CartPanel } from '@/components/menu/cart';
import ActiveOrderChip from '@/components/active-order-chip';
import WaiterCallButton from '@/components/menu/waiter-call-button';
import RewardsSection from '@/components/menu/rewards-section';
import BottomNav, { type NavTab } from '@/components/menu/bottom-nav';
import AccountSheet from '@/components/menu/account-sheet';
import MyOrders from '@/components/my-orders';
import OverlayBackground from '@/components/menu/overlay-background';
import { useCart } from '@/lib/cart-context';
import { getScannedTable } from '@/lib/table-session';
import type { WeeklyHours } from '@/lib/hours';
import type { Category, Product } from '@/types';
import type { MenuReward } from '@/components/menu/rewards-section';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'> & {
  is_available?: boolean | null;
  unavailable_at?: string | null;
};

interface Props {
  categories: CatItem[];
  products: ProdItem[];
  ordersEnabled?: boolean;
  restaurantId?: string;
  timezone?: string;
  llamadaMeseroEnabled?: boolean;
  initialMesa?: number;
  /** Módulo de lealtad activo (independiente de si el catálogo de canje está habilitado). */
  loyaltyOn?: boolean;
  /** Catálogo de recompensas canjeables (null = canje deshabilitado). */
  rewardsCatalog?: MenuReward[] | null;
  redeemValue?: number;
  googleAuthEnabled?: boolean;
  /** Número de WhatsApp del restaurante para el botón de contacto en "Mi cuenta". */
  whatsappNumber?: string | null;
}

function hasOptions(p: ProdItem): boolean {
  return Array.isArray(p.options) && p.options.some((g) => g.choices?.length > 0);
}

export default function MenuClient({
  categories, products, ordersEnabled = false, restaurantId, timezone = 'America/Guatemala',
  llamadaMeseroEnabled = false, initialMesa, loyaltyOn = false, rewardsCatalog = null,
  redeemValue = 0, googleAuthEnabled = false, whatsappNumber = null,
}: Props) {
  const { items, addItem, qtyOfProduct } = useCart();
  const [selected, setSelected] = useState<ProdItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [tableScanned, setTableScanned] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    setTableScanned((initialMesa != null && initialMesa > 0) || getScannedTable(restaurantId) !== null);
  }, [initialMesa, restaurantId]);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const catIcon = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.icon?.trim() ? c.icon : 'utensils');
    return m;
  }, [categories]);

  function onAdd(product: ProdItem, sourceEl: HTMLElement) {
    void sourceEl; // sin animación de vuelo (el icono del carrito ahora está en la barra inferior)
    if (hasOptions(product)) { setCartOpen(false); setSelected(product); return; }
    addItem({ productId: product.id, name: product.name, price: product.price, image_url: product.image_url });
  }

  // Pestañas de navegación: la activa depende de qué panel está abierto.
  const activeTab: NavTab = pedidosOpen ? 'pedidos' : accountOpen ? 'cuenta' : rewardsOpen ? 'fidelidad' : 'menu';

  function openRewards()  { setAccountOpen(false); setPedidosOpen(false); setRewardsOpen(true); }
  function openAccount()  { setRewardsOpen(false); setPedidosOpen(false); setAccountOpen(true); }
  function openPedidos()  { setRewardsOpen(false); setAccountOpen(false); setPedidosOpen(true); }
  function closeOverlays() { setRewardsOpen(false); setAccountOpen(false); setPedidosOpen(false); }

  return (
    <>
      {loyaltyOn && restaurantId && (
        <RewardsSection
          restaurantId={restaurantId}
          rewards={rewardsCatalog ?? []}
          redeemValue={redeemValue}
          googleAuthEnabled={googleAuthEnabled}
          ordersEnabled={ordersEnabled}
          open={rewardsOpen}
          onClose={() => setRewardsOpen(false)}
        />
      )}

      <Catalog
        categories={categories}
        products={products}
        ordersEnabled={ordersEnabled}
        timezone={timezone}
        qtyOf={qtyOfProduct}
        onAdd={onAdd}
        onOpen={(p) => { setCartOpen(false); setSelected(p); }}
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

      {llamadaMeseroEnabled && restaurantId && tableScanned && !selected && !cartOpen && (
        <WaiterCallButton restaurantId={restaurantId} raised={ordersEnabled && count > 0} />
      )}

      {/* Barra de navegación inferior — se oculta cuando hay un sheet de producto o carrito abierto */}
      {ordersEnabled && !selected && !cartOpen && (
        <BottomNav
          active={activeTab}
          ordersEnabled={ordersEnabled}
          loyaltyOn={loyaltyOn}
          onSelectMenu={closeOverlays}
          onSelectPedidos={openPedidos}
          onSelectFidelidad={openRewards}
          onSelectCuenta={openAccount}
        />
      )}

      {/* Panel "Mis pedidos" */}
      {pedidosOpen && restaurantId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mis pedidos"
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--brand-bg)', overflowY: 'auto' }}
        >
          <OverlayBackground />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <MyOrders restaurantId={restaurantId} onBack={closeOverlays} />
          </div>
        </div>
      )}

      {/* Panel "Mi cuenta" */}
      {accountOpen && restaurantId && (
        <AccountSheet
          restaurantId={restaurantId}
          loyaltyOn={loyaltyOn}
          redeemValue={redeemValue}
          googleAuthEnabled={googleAuthEnabled}
          whatsappNumber={whatsappNumber}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </>
  );
}
