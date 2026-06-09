'use client';

/* Carrito del cliente — barra inferior (resumen) + panel (bottom-sheet).
   Moneda y textos vienen del motor. Portado de ClientScreens.jsx. */

import { useEffect } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, QtyStepper, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeContent } from '@/lib/theme/context';

/* Barra inferior fija con el resumen del carrito. */
export function CartBar({ onOpen, cartIconHidden }: { onOpen: () => void; cartIconHidden?: boolean }) {
  const { count, total } = useCart();
  const content = useThemeContent();
  if (count === 0 || cartIconHidden) return null;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', justifyContent: 'center', padding: '0 16px 16px', pointerEvents: 'none' }}>
      <Glass
        interactive
        onClick={onOpen}
        className="anim-slide-up"
        style={{ pointerEvents: 'auto', width: '100%', maxWidth: 460, borderRadius: 17, padding: '12px 14px 12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="t-kicker" style={{ fontSize: 10.5 }}>{count} {count === 1 ? content.cart.itemsOne : content.cart.itemsMany}</span>
          <Price amount={total} size={18} />
        </div>
        <span className="btn-white" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 13, fontWeight: 600, fontSize: 14 }}>
          {content.cart.barCta} <Icon name="arrowRight" size={16} />
        </span>
      </Glass>
    </div>
  );
}

/* Panel del carrito (bottom-sheet). */
export function CartPanel({ onClose }: { onClose: () => void }) {
  const { items, updateQuantity, total } = useCart();
  const content = useThemeContent();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={content.cart.title}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div
        className="glass anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 460, borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: '20px 20px 28px', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="t-display" style={{ fontSize: 26 }}>{content.cart.title}</h2>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 11, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Icon name="bag" size={48} strokeWidth={1.3} style={{ color: 'var(--u-text-4)' }} />
            <p className="t-mute" style={{ fontSize: 15 }}>{content.cart.empty}</p>
            <PrimaryButton onClick={onClose}>{content.cart.emptyCta}</PrimaryButton>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {items.map((item) => (
                <Glass key={item.productId} variant="quiet" style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{item.name}</div>
                    <Price amount={item.price * item.quantity} size={14} style={{ marginTop: 3 }} />
                  </div>
                  <QtyStepper
                    value={item.quantity}
                    onMinus={() => updateQuantity(item.productId, item.quantity - 1)}
                    onPlus={() => updateQuantity(item.productId, item.quantity + 1)}
                  />
                </Glass>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>{content.cart.total}</span>
                <Price amount={total} size={22} />
              </div>
              <PrimaryButton href="/checkout" onClick={onClose} size="lg" full iconRight="arrowRight">{content.cart.checkout}</PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
