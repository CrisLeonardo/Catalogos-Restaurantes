'use client';

/* Detalle de producto en bottom-sheet. Arte (foto o BrandPattern), tags,
   tiempo de preparación, stepper y botón agregar. Portado de la pantalla
   Detalle del prototipo, adaptado a sheet web. */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Tag, QtyStepper, PrimaryButton, Price } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import type { Product } from '@/types';

type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags'>;

export default function ProductSheet({
  product, icon, ordersEnabled, onClose,
}: {
  product: ProdItem;
  icon: string;
  ordersEnabled: boolean;
  onClose: () => void;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const { items, addItem, updateQuantity } = useCart();
  const current = items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const [qty, setQty] = useState(current || 1);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function add() {
    if (current === 0) addItem({ productId: product.id, name: product.name, price: product.price, image_url: product.image_url });
    updateQuantity(product.id, qty);
    onClose();
  }

  const usePhoto = product.image_url && config.productArt !== 'pattern';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div
        className="glass anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 460, borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: '18px 20px 24px', maxHeight: '88dvh', overflowY: 'auto' }}
      >
        <button
          onClick={onClose}
          className="press glass-quiet"
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, width: 34, height: 34, borderRadius: 11, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}
          aria-label="Cerrar"
        >
          <Icon name="x" size={18} />
        </button>

        {/* Hero */}
        <div style={{ borderRadius: 22, overflow: 'hidden', position: 'relative', aspectRatio: '1.5', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--u-hair)' }}>
          {usePhoto ? (
            <Image src={product.image_url!} alt={product.name} fill style={{ objectFit: 'cover' }} sizes="460px" unoptimized />
          ) : (
            <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
              <BrandPattern icon={icon} seed={seedFromString(product.id)} iconScale={1.5} faint={0.2} />
            </div>
          )}
          {config.showTags && product.tags && product.tags.length > 0 && (
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
              {product.tags.map((t) => <Tag key={t} label={t} />)}
            </div>
          )}
        </div>

        <div style={{ padding: '18px 2px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="t-display" style={{ fontSize: 28 }}>{product.name}</h2>
          {product.description && (
            <p className="t-serif" style={{ fontSize: 17, fontStyle: 'italic', color: 'var(--u-text-2)', lineHeight: 1.4 }}>{product.description}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            {[{ i: 'clock', t: content.product.prepTime }, { i: 'flame', t: content.product.fresh }].map((x, k) => (
              <Glass key={k} variant="quiet" style={{ borderRadius: 12, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Icon name={x.i} size={16} style={{ color: 'var(--u-text-2)' }} />
                <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 500 }}>{x.t}</span>
              </Glass>
            ))}
          </div>
        </div>

        {/* Acción */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
          {ordersEnabled ? (
            <>
              <QtyStepper value={qty} size="lg" onMinus={() => setQty(Math.max(1, qty - 1))} onPlus={() => setQty(qty + 1)} />
              <PrimaryButton size="lg" full onClick={add} style={{ flex: 1 }}>
                {content.product.add} · <span className="t-mono" style={{ fontWeight: 700 }}>{formatPrice(product.price * qty, config)}</span>
              </PrimaryButton>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <Price amount={product.price} size={24} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
