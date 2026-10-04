'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import Catalog from '@/components/menu/catalog';
import ProductSheet from '@/components/menu/product-sheet';
import { CartBar, CartPanel } from '@/components/menu/cart';
import ActiveOrderChip from '@/components/active-order-chip';
import WaiterCallButton from '@/components/menu/waiter-call-button';
import RewardsSection from '@/components/menu/rewards-section';
import BottomNav, { type NavTab } from '@/components/menu/bottom-nav';
import OverlayBackground from '@/components/menu/overlay-background';
import { useCart } from '@/lib/cart-context';
import { getScannedTable, watchScannedTable, isStandaloneLaunch } from '@/lib/table-session';
import { isKioskMode } from '@/lib/kiosk';
import { getMyAccount } from '@/lib/actions/loyalty';
import { hasAnyHours, isOpenNow, type WeeklyHours } from '@/lib/hours';
import { useThemeConfig } from '@/lib/theme/context';
import { sugerirAcompanantes } from '@/lib/menu-pairings';
import type { Sugerencia } from '@/components/menu/pairings';
import type { Category, Product } from '@/types';
import type { MenuReward } from '@/components/menu/rewards-section';

/* Pantallas que solo existen cuando el comensal las abre (Mi cuenta, Mis
   pedidos, la invitación a la lealtad): se bajan al abrirlas, no con la
   carta. Lo primero que tiene que llegar a un teléfono que acaba de
   escanear un QR es el menú, no el formulario de su cuenta. */
const AccountSheet = dynamic(() => import('@/components/menu/account-sheet'));
const MyOrders = dynamic(() => import('@/components/my-orders'));
const GoogleLoyaltyIntro = dynamic(() => import('@/components/menu/google-loyalty-intro'));

type CatItem = Pick<Category, 'id' | 'name' | 'icon' | 'name_en'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'> & {
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
  googleAuthEnabled?: boolean;
  /** Número de WhatsApp del restaurante para el botón de contacto en "Mi cuenta". */
  whatsappNumber?: string | null;
  /** Ubicación del restaurante + radio de cobertura, para el mapa en "Mi cuenta". */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryRadiusKm?: number | null;
}

/** «Acompáñalo con…» para lo que ya se lleva (CAT-13, lib/menu-pairings.ts). */
function acompanantesPara(base: string[], products: ProdItem[], categories: CatItem[], timezone: string): Sugerencia[] {
  const now = new Date();
  const catById = new Map(categories.map((c) => [c.id, c]));
  return sugerirAcompanantes({
    productos: products,
    categorias: categories,
    base,
    categoriaAbierta: (id) => {
      const c = catById.get(id);
      return !c || !hasAnyHours(c.availability) || isOpenNow(c.availability, timezone, now);
    },
    now: now.getTime(),
  });
}

function hasOptions(p: ProdItem): boolean {
  return Array.isArray(p.options) && p.options.some((g) => g.choices?.length > 0);
}

export default function MenuClient({
  categories, products, ordersEnabled = false, restaurantId, timezone = 'America/Guatemala',
  llamadaMeseroEnabled = false, initialMesa, loyaltyOn = false, rewardsCatalog = null,
  googleAuthEnabled = false, whatsappNumber = null,
  restaurantLat = null, restaurantLng = null, deliveryRadiusKm = null,
}: Props) {
  const { items, addItem, qtyOfProduct } = useCart();
  const [selected, setSelected] = useState<ProdItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [tableScanned, setTableScanned] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [googleIntroOpen, setGoogleIntroOpen] = useState(false);
  // MODO KIOSKO (autoservicio): dispositivo compartido del local. Se ocultan
  // cuenta/fidelidad/mis pedidos (datos personales de otros clientes) y los
  // avisos de Google; el pedido va directo al checkout de mostrador.
  const [kiosk, setKiosk] = useState(false);

  useEffect(() => {
    setKiosk(isKioskMode());
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    // Primer render: initialMesa cubre la carrera con el efecto de menu-shell
    // que aún no guardó el ?mesa= en localStorage — salvo en modo standalone
    // ("Añadir a inicio"), donde ?mesa= puede ser un valor viejo congelado en
    // el ícono y NO debe asumirse como mesa vigente (ver isStandaloneLaunch).
    const trustInitialMesa = initialMesa != null && initialMesa > 0 && !isStandaloneLaunch();
    setTableScanned(trustInitialMesa || getScannedTable(restaurantId) !== null);
    // Después, la fuente de verdad es localStorage + TTL: watchScannedTable
    // re-valida al volver a primer plano y al vencer el TTL — sin esto, una
    // PWA que quedó viva en memoria seguía ofreciendo "comer en local" y
    // "llamar al mesero" días después de escanear la mesa.
    return watchScannedTable(restaurantId, (t) => setTableScanned(t !== null));
  }, [initialMesa, restaurantId]);

  // El login con Google es una redirección de página completa (/auth/callback),
  // así que cualquier sheet abierto se pierde en la vuelta. GoogleSignInButton
  // marca a dónde volver con ?openTab=; lo reabrimos aquí y limpiamos la URL.
  // `auth_error=1` llega si el intercambio del código OAuth falló (link
  // vencido, doble intento, etc.) — antes se perdía en silencio y el
  // comensal volvía al menú sin sesión y sin ningún aviso de qué pasó.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('openTab');
    const hadAuthError = params.get('auth_error') === '1';
    if (tab === 'cuenta') setAccountOpen(true);
    else if (tab === 'fidelidad') setRewardsOpen(true);
    if (hadAuthError) setAuthError(true);
    if (!tab && !hadAuthError) return;
    params.delete('openTab');
    params.delete('auth_error');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  useEffect(() => {
    if (!authError) return;
    const t = setTimeout(() => setAuthError(false), 6000);
    return () => clearTimeout(t);
  }, [authError]);

  // Aviso de una sola vez (primera visita a este restaurante) explicando que
  // los puntos de fidelidad requieren sesión de Google. Se omite si ya hay
  // sesión iniciada (getMyAccount) para no molestar a quien ya la usa.
  useEffect(() => {
    if (!restaurantId || !loyaltyOn || !googleAuthEnabled) return;
    if (isKioskMode()) return; // kiosko: sin invitaciones a iniciar sesión
    const key = `google-loyalty-intro-${restaurantId}`;
    if (localStorage.getItem(key)) return;
    let cancelled = false;
    (async () => {
      const acc = await getMyAccount(restaurantId).catch(() => null);
      if (cancelled) return;
      localStorage.setItem(key, '1');
      if (!acc?.loggedIn) setGoogleIntroOpen(true);
    })();
    return () => { cancelled = true; };
  }, [restaurantId, loyaltyOn, googleAuthEnabled]);

  const count = items.reduce((s, i) => s + i.quantity, 0);

  /* «Acompáñalo con…» (CAT-13). Se calcula con la carta que ya está en la
     página: ni una consulta más. En la ficha, contra el platillo abierto y
     lo que ya hay en el carrito; en el carrito, contra lo que lleva. */
  const config = useThemeConfig();
  const pairingsOn = ordersEnabled && config.suggestPairings !== false;
  const enCarrito = useMemo(() => items.map((i) => i.productId), [items]);
  const sheetPairings = useMemo(
    () => (pairingsOn && selected ? acompanantesPara([selected.id, ...enCarrito], products, categories, timezone) : []),
    [pairingsOn, selected, enCarrito, products, categories, timezone],
  );
  const cartPairings = useMemo(
    () => (pairingsOn && cartOpen ? acompanantesPara(enCarrito, products, categories, timezone) : []),
    [pairingsOn, cartOpen, enCarrito, products, categories, timezone],
  );
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
          key={selected.id}
          product={selected}
          icon={selected.icon || catIcon.get(selected.category_id ?? '') || 'utensils'}
          ordersEnabled={ordersEnabled}
          acompanantes={sheetPairings}
          onClose={() => setSelected(null)}
        />
      )}

      {ordersEnabled && <CartBar onOpen={() => setCartOpen(true)} />}
      {ordersEnabled && cartOpen && <CartPanel sugerencias={cartPairings} onClose={() => setCartOpen(false)} />}
      {ordersEnabled && restaurantId && !selected && !cartOpen && !kiosk && (
        <ActiveOrderChip restaurantId={restaurantId} />
      )}

      {llamadaMeseroEnabled && restaurantId && tableScanned && !selected && !cartOpen && !kiosk && (
        <WaiterCallButton restaurantId={restaurantId} raised={ordersEnabled && count > 0} />
      )}

      {/* Barra de navegación inferior — se oculta cuando hay un sheet de producto
          o carrito abierto, y en KIOSKO (cuenta/fidelidad/pedidos son datos
          personales que no deben quedar a la vista en un aparato compartido). */}
      {ordersEnabled && !selected && !cartOpen && !kiosk && (
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

      {/* Distintivo discreto del modo kiosko (confirma al staff que quedó activo) */}
      {kiosk && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', top: 'calc(8px + env(safe-area-inset-top, 0px))', left: '50%',
            transform: 'translateX(-50%)', zIndex: 60, pointerEvents: 'none',
            padding: '4px 12px', borderRadius: 'var(--m-r-pill)', fontSize: 'var(--m-fs-xs)', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'color-mix(in srgb, var(--u-text) 10%, transparent)',
            color: 'var(--u-text-3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          Autoservicio
        </div>
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
          googleAuthEnabled={googleAuthEnabled}
          whatsappNumber={whatsappNumber}
          restaurantLat={restaurantLat}
          restaurantLng={restaurantLng}
          deliveryRadiusKm={deliveryRadiusKm}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {/* Aviso: el inicio de sesión con Google no se completó */}
      {authError && (
        <div
          role="alert"
          style={{
            position: 'fixed', zIndex: 90,
            top: 'calc(12px + env(safe-area-inset-top, 0px))', left: 16, right: 16,
            display: 'flex', justifyContent: 'center',
          }}
        >
          <Glass style={{ width: '100%', maxWidth: 420, borderRadius: 'var(--m-r-md)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="alertCircle" size={18} style={{ color: 'var(--c-danger, #f87171)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--m-fs-sm)', flex: 1, lineHeight: 1.4 }}>
              No pudimos completar el inicio de sesión con Google. Intenta de nuevo.
            </span>
            <button
              type="button"
              onClick={() => setAuthError(false)}
              aria-label="Cerrar aviso"
              className="press"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', flexShrink: 0, display: 'grid', placeItems: 'center' }}
            >
              <Icon name="x" size={16} />
            </button>
          </Glass>
        </div>
      )}

      {/* Aviso de primera visita: fidelidad requiere sesión de Google */}
      {googleIntroOpen && (
        <GoogleLoyaltyIntro onClose={() => setGoogleIntroOpen(false)} />
      )}
    </>
  );
}
