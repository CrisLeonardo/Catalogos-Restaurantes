'use client';

/* Carrito del cliente — barra inferior (resumen) + panel (bottom-sheet).
   Moneda y textos vienen del motor. Portado de ClientScreens.jsx. */

import { Icon } from '@/components/icons';
import { Price, QtyStepper, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeContent, useThemeConfig, useText } from '@/lib/theme/context';
import { useTenantPrefix } from '@/lib/tenant-client';
import { Acompanantes, type Sugerencia } from '@/components/menu/pairings';
import { formatPrice } from '@/lib/theme/resolve';
import styles from '@/components/ui/capsule-navigation.module.css';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useLocale } from '@/lib/locale/context';
import type { CartItem } from '@/types';

/* Barra inferior fija con el resumen del carrito. */
export function CartBar({ onOpen, cartIconHidden, navigationVisible = true }: {
  onOpen: () => void; cartIconHidden?: boolean; navigationVisible?: boolean;
}) {
  const { count, total, items } = useCart();
  const content = useThemeContent();
  const config = useThemeConfig();
  if (count === 0 || cartIconHidden) return null;

  const nombre = items.length === 1 ? items[0].name : content.cart.title;
  const importe = formatPrice(total, config);
  return (
    <div data-carrito-destino="" className={`${styles.surface} ${styles.cartDock}`} data-without-nav={!navigationVisible}>
      <button
        type="button"
        onClick={onOpen}
        className={styles.cartTray}
        aria-label={`${content.cart.barCta} · ${count} ${count === 1 ? content.cart.itemsOne : content.cart.itemsMany} · ${importe}`}
      >
        <span className={styles.cartCount}>{count} {count === 1 ? content.cart.itemsOne : content.cart.itemsMany}</span>
        <span className={styles.cartProduct}>
          <span className={styles.cartName}>{nombre}</span>
          <span className={styles.cartPrice}>{importe}</span>
        </span>
        <span className={styles.cartBag} aria-hidden="true"><Icon name="bag" size={24} /></span>
      </button>
    </div>
  );
}

/* Panel del carrito (bottom-sheet).
   Auditoría 1.11 (M04, D08, E08, F10): la misma `HojaOperativa` que la ficha
   del platillo —foco dentro, Escape, devuelve el foco— sobre la superficie
   sólida del tema (antes era vidrio con desenfoque y un `div role="dialog"`
   sin manejo de foco). Cada platillo con opciones se puede «Cambiar» sin
   borrarlo ni rearmarlo; sus opciones dicen lo que suman. */
export function CartPanel({ onClose, sugerencias = [], onPedirDemo, onEditar }: {
  onClose: () => void;
  /** «Acompáñalo con…» con lo que todavía no lleva (CAT-13). */
  sugerencias?: Sugerencia[];
  /** En la demo no hay checkout: el botón abre «Pídelo tú mismo». */
  onPedirDemo?: () => void;
  /** «Cambiar» una línea: abre su ficha con lo elegido (M04). */
  onEditar?: (item: CartItem) => void;
}) {
  const { items, addItem, updateQuantity, removeItem, total, pointsToRedeem } = useCart();
  const content = useThemeContent();
  const config = useThemeConfig();
  const titleT = useText('heading', 'cartTitle');
  const checkoutHref = useTenantPrefix('/checkout');
  const { locale } = useLocale();
  const es = locale !== 'en';

  const pie = items.length === 0 ? (
    <PrimaryButton onClick={onClose} size="lg" full>{content.cart.emptyCta}</PrimaryButton>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pointsToRedeem > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--m-fs-sm)', color: 'var(--brand-accent-ink)', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="gift" size={14} /> Puntos a canjear</span>
          <span>{pointsToRedeem.toLocaleString('es-GT')} pts</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--m-fs-lg)', color: 'var(--u-text)' }}>{content.cart.total}</span>
        <Price amount={total} size={22} />
      </div>
      {onPedirDemo
        ? <PrimaryButton onClick={onPedirDemo} size="lg" full iconRight="arrowRight">Enviar mi pedido de prueba</PrimaryButton>
        : <PrimaryButton href={checkoutHref} onClick={onClose} size="lg" full iconRight="arrowRight">{content.cart.checkout}</PrimaryButton>}
    </div>
  );

  return (
    <HojaOperativa
      label={content.cart.title}
      title={<span className="t-display" style={{ ...titleT.vars, fontSize: 24 * titleT.size }}>{content.cart.title}</span>}
      closeLabel={es ? 'Cerrar' : 'Close'}
      className="hoja-platillo hoja-carrito"
      onClose={onClose}
      footer={pie}
    >
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Icon name="bag" size={48} strokeWidth={1.3} style={{ color: 'var(--u-text-4)' }} />
          <p className="t-mute" style={{ fontSize: 'var(--m-fs-md)', margin: 0 }}>{content.cart.empty}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-2)' }}>
          {items.map((item) => (
            <div key={item.lineId} className="m-surface m-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ct-product-name m-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {item.rewardId && <Icon name="gift" size={14} style={{ color: 'var(--brand-accent-ink)' }} />}
                  {item.name}
                </div>
                {item.options && item.options.length > 0 && (
                  <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.4 }}>
                    {item.options.map((o) => {
                      const nombre = o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName;
                      return o.priceDelta ? `${nombre} ${o.priceDelta > 0 ? '+' : '−'}${formatPrice(Math.abs(o.priceDelta), config)}` : nombre;
                    }).join(' · ')}
                  </div>
                )}
                {item.rewardId ? (
                  <div style={{ marginTop: 3, fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--brand-accent-ink)' }}>
                    Gratis · {(item.pointsCost ?? 0).toLocaleString('es-GT')} pts
                  </div>
                ) : (
                  /* En bloque: el nombre es `inline-flex` (por el regalo) y el
                     precio, un <span>; seguidos salían pegados en el mismo
                     renglón («Lox del BarrioQ62.00»). */
                  <Price amount={item.price * item.quantity} size={14} style={{ marginTop: 3, display: 'block' }} />
                )}
                {onEditar && !item.rewardId && item.options && item.options.length > 0 && (
                  <button type="button" className="press" onClick={() => onEditar(item)}
                    aria-label={`${es ? 'Cambiar' : 'Change'} ${item.name}`}
                    style={{ marginTop: 4, padding: '8px 0', minHeight: 40, background: 'none', border: 'none', color: 'var(--brand-accent-ink)', fontWeight: 600, fontSize: 'var(--m-fs-sm)', cursor: 'pointer' }}>
                    {es ? 'Cambiar' : 'Change'}
                  </button>
                )}
              </div>
              {item.rewardId ? (
                <button
                  onClick={() => removeItem(item.lineId)}
                  className="press m-tap"
                  style={{ borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', color: 'var(--u-text-3)', cursor: 'pointer' }}
                  aria-label="Quitar recompensa"
                >
                  <Icon name="trash" size={17} />
                </button>
              ) : (
                <QtyStepper
                  value={item.quantity}
                  onMinus={() => updateQuantity(item.lineId, item.quantity - 1)}
                  onPlus={() => updateQuantity(item.lineId, item.quantity + 1)}
                />
              )}
            </div>
          ))}

          {/* Aquí se agregan al tocar: ya es el carrito. Lo agregado sale
              de la lista de arriba y deja de sugerirse. */}
          <div style={{ marginTop: 'var(--m-sp-3)' }}>
            <Acompanantes
              items={sugerencias}
              onToggle={(a) => addItem({ productId: a.id, name: a.name, price: a.price, image_url: a.image_url ?? null })}
              nota={{ es: 'Toca para agregar', en: 'Tap to add' }}
            />
          </div>
        </div>
      )}
    </HojaOperativa>
  );
}
