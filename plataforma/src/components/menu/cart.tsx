'use client';

/* Carrito del cliente — barra inferior (resumen) + panel (bottom-sheet).
   Moneda y textos vienen del motor. Portado de ClientScreens.jsx. */

import { useEffect } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, QtyStepper, PrimaryButton, ctaClass } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeContent, useThemeConfig, useText } from '@/lib/theme/context';
import { useTenantPrefix } from '@/lib/tenant-client';

/* Barra inferior fija con el resumen del carrito. */
export function CartBar({ onOpen, cartIconHidden }: { onOpen: () => void; cartIconHidden?: boolean }) {
  const { count, total } = useCart();
  const content = useThemeContent();
  const config = useThemeConfig();
  if (count === 0 || cartIconHidden) return null;

  return (
    <div style={{ position: 'fixed', bottom: 68, left: 0, right: 0, zIndex: 40, display: 'flex', justifyContent: 'center', padding: '0 16px 16px', pointerEvents: 'none' }}>
      <Glass
        interactive
        onClick={onOpen}
        className="anim-slide-up"
        style={{ pointerEvents: 'auto', width: '100%', maxWidth: 460, borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-3) var(--m-sp-3) var(--m-sp-3) var(--m-sp-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 10,5 px para decir cuantos productos llevas, justo encima de un
              precio de 18: el dato que confirma el pedido era ilegible. */}
          <span className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)' }}>{count} {count === 1 ? content.cart.itemsOne : content.cart.itemsMany}</span>
          <Price amount={total} size={18} />
        </div>
        <span className={ctaClass(config.ctaStyle)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 18px', minHeight: 'var(--m-tap)', borderRadius: 'var(--m-r-md)', fontWeight: 600, fontSize: 'var(--m-fs-sm)' }}>
          {content.cart.barCta} <Icon name="arrowRight" size={16} />
        </span>
      </Glass>
    </div>
  );
}

/* Panel del carrito (bottom-sheet). */
export function CartPanel({ onClose }: { onClose: () => void }) {
  const { items, updateQuantity, removeItem, total, pointsToRedeem } = useCart();
  const content = useThemeContent();
  const titleT = useText('heading', 'cartTitle');
  const checkoutHref = useTenantPrefix('/checkout');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="menu-sheet-wrap"
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={content.cart.title}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      {/* `.menu-sheet`: hoja pegada al borde inferior en el teléfono (el gesto
          del pulgar) y diálogo centrado de tablet para arriba. Ver globals.css. */}
      <div
        className="glass anim-slide-up menu-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '20px 20px 28px', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="t-display" style={{ ...titleT.vars, fontSize: 26 * titleT.size }}>{content.cart.title}</h2>
          {/* Media 34 px. Cerrar una hoja a pantalla completa no puede ser el
              objetivo mas dificil de acertar de la pantalla. */}
          <button onClick={onClose} className="press m-tap" style={{ borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', color: 'var(--u-text)', cursor: 'pointer' }} aria-label="Cerrar">
            <Icon name="x" size={19} />
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Icon name="bag" size={48} strokeWidth={1.3} style={{ color: 'var(--u-text-4)' }} />
            <p className="t-mute" style={{ fontSize: 'var(--m-fs-md)' }}>{content.cart.empty}</p>
            <PrimaryButton onClick={onClose}>{content.cart.emptyCta}</PrimaryButton>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-2)', marginBottom: 'var(--m-sp-4)' }}>
              {/* La hoja del carrito YA es vidrio. Cada linea era otro vidrio
                  encima: dos desenfoques apilados que solo lavan el texto. */}
              {items.map((item) => (
                <div key={item.lineId} className="m-surface m-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ct-product-name m-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {item.rewardId && <Icon name="gift" size={14} style={{ color: 'var(--brand-accent-ink)' }} />}
                      {item.name}
                    </div>
                    {item.options && item.options.length > 0 && (
                      <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.4 }}>
                        {item.options.map((o) => o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName).join(' · ')}
                      </div>
                    )}
                    {item.rewardId ? (
                      <div style={{ marginTop: 3, fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--brand-accent-ink)' }}>
                        Gratis · {(item.pointsCost ?? 0).toLocaleString('es-GT')} pts
                      </div>
                    ) : (
                      <Price amount={item.price * item.quantity} size={14} style={{ marginTop: 3 }} />
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
            </div>

            <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 'var(--m-sp-4)' }}>
              {pointsToRedeem > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--m-sp-2)', fontSize: 'var(--m-fs-sm)', color: 'var(--brand-accent-ink)', fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="gift" size={14} /> Puntos a canjear</span>
                  <span>{pointsToRedeem.toLocaleString('es-GT')} pts</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--m-fs-lg)', color: 'var(--u-text)' }}>{content.cart.total}</span>
                <Price amount={total} size={22} />
              </div>
              <PrimaryButton href={checkoutHref} onClick={onClose} size="lg" full iconRight="arrowRight">{content.cart.checkout}</PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
