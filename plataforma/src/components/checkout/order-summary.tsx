'use client';

import { memo, useState } from 'react';
import { Icon } from '@/components/icons';
import { Price } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { validateCoupon } from '@/lib/actions/cupones';
import type { CartItem } from '@/types';

export interface AppliedCoupon { discount: number; code: string }

/* El resumen del pedido, con el cupón y la propina. Memorizado (REN-04): sus
   props son cifras y la lista del carrito, que no cambian mientras el
   comensal escribe su nombre o su dirección — antes cada tecla volvía a
   pintar la lista entera. Lo que se escribe en el cupón vive aquí dentro. */
const OrderSummary = memo(function OrderSummary({
  restaurantId, items, total, pointsToRedeem, deliveryFee, discount, tipAmount, tipAvailable,
  finalTotal, hasCoupons, appliedCoupon, onCouponChange,
}: {
  restaurantId: string;
  items: CartItem[];
  total: number;
  pointsToRedeem: number;
  deliveryFee: number;
  discount: number;
  tipAmount: number;
  tipAvailable: boolean;
  finalTotal: number;
  hasCoupons: boolean;
  appliedCoupon: AppliedCoupon | null;
  onCouponChange: (c: AppliedCoupon | null) => void;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();

  return (
    /* El resumen no flota sobre nada: es el contenido de la página. Los
       interruptores de vidrio que SÍ hay en el checkout (opciones de pago
       y campos del formulario) son del dueño y se respetan tal cual. */
    <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4) var(--m-sp-4)', marginBottom: 'var(--m-sp-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 'var(--m-fs-md)', color: 'var(--u-text-2)', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {item.rewardId && <Icon name="gift" size={13} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />}
              <span>
                {item.quantity}× {item.name}
                {item.options && item.options.length > 0 && (
                  <span style={{ display: 'block', fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', marginTop: 1 }}>
                    {item.options.map((o) => o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName).join(' · ')}
                  </span>
                )}
              </span>
            </span>
            {item.rewardId
              ? <span style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--brand-accent-ink)', whiteSpace: 'nowrap' }}>{(item.pointsCost ?? 0).toLocaleString('es-GT')} pts</span>
              : <Price amount={item.price * item.quantity} size={13.5} muted />}
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(deliveryFee > 0 || discount > 0 || tipAmount > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)' }}>{content.cart.subtotal}</span>
              <Price amount={total} size={13.5} muted />
            </div>
          )}
          {deliveryFee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)' }}>{content.cart.shipping}</span>
              <Price amount={deliveryFee} size={13.5} muted />
            </div>
          )}
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-ok)' }}>Descuento{appliedCoupon ? ` · ${appliedCoupon.code}` : ''}</span>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-ok)', fontWeight: 600 }}>−{formatPrice(discount, config)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)' }}>Propina ({config.tipPercent}%)</span>
              <Price amount={tipAmount} size={13.5} muted />
            </div>
          )}
          {pointsToRedeem > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--brand-accent-ink)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="gift" size={13} /> Recompensas (puntos a usar)</span>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--brand-accent-ink)', fontWeight: 600 }}>{pointsToRedeem.toLocaleString('es-GT')} pts</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 'var(--m-fs-lg)', fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
            <Price amount={finalTotal} size={20} />
          </div>
        </div>

        {/* Cupón — solo si el restaurante tiene cupones activos */}
        {hasCoupons && (
          <CouponBox restaurantId={restaurantId} total={total} applied={appliedCoupon} onChange={onCouponChange} />
        )}

        {/* Propina — obligatoria cuando el restaurante la habilita. */}
        {tipAvailable && (
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="sparkle" size={15} style={{ color: 'var(--brand-accent-ink)' }} />
                Propina ({config.tipPercent}%)
              </span>
              <span style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--u-text)' }}>
                +{formatPrice(tipAmount, config)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default OrderSummary;

function CouponBox({ restaurantId, total, applied, onChange }: {
  restaurantId: string;
  total: number;
  applied: AppliedCoupon | null;
  onChange: (c: AppliedCoupon | null) => void;
}) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(false);

  async function apply() {
    if (!code.trim()) return;
    setChecking(true);
    setMsg('');
    const res = await validateCoupon(restaurantId, code.trim(), total);
    setChecking(false);
    if (res.ok) {
      onChange({ discount: res.discount, code: res.code });
      setMsg('');
    } else {
      onChange(null);
      setMsg(res.error);
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
      {applied ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-ok)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="checkCircle" size={15} /> Cupón {applied.code} aplicado
          </span>
          <button type="button" onClick={() => { onChange(null); setCode(''); setMsg(''); }} className="press t-mute" style={{ fontSize: 'var(--m-fs-sm)', minHeight: 'var(--m-tap)', padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'var(--u-text-3)' }}>
            Quitar
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="¿Tienes un cupón?"
            style={{ flex: 1, minHeight: 'var(--m-tap)', background: 'var(--surface-2)', border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: '10px 12px', color: 'var(--u-text)', fontSize: 'max(16px, var(--m-fs-md))', outline: 'none', textTransform: 'uppercase' }}
          />
          <button type="button" onClick={apply} disabled={checking || !code.trim()} className="press" style={{ padding: '0 18px', minHeight: 'var(--m-tap)', background: 'var(--surface-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)', cursor: 'pointer', fontSize: 'var(--m-fs-sm)', fontWeight: 600, color: 'var(--u-text)', opacity: checking || !code.trim() ? 0.6 : 1 }}>
            {checking ? '…' : 'Aplicar'}
          </button>
        </div>
      )}
      {msg && <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger)', marginTop: 7 }}>{msg}</p>}
    </div>
  );
}
