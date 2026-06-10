'use client';

/* Detalle de producto en bottom-sheet. Arte (foto o BrandPattern), tags,
   tiempo de preparación, grupos de opciones (variantes/extras), stepper y
   botón agregar. El precio del botón refleja base + opciones en vivo. */

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Tag, QtyStepper, PrimaryButton, Price } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import type { CartItemOption, Product, ProductOptionGroup } from '@/types';

type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'>;

/** Selección inicial: los grupos single requeridos arrancan con su primera opción. */
function initialSelection(groups: ProductOptionGroup[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    sel[g.id] = g.type === 'single' && g.required && g.choices.length > 0 ? [g.choices[0].id] : [];
  }
  return sel;
}

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
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);

  const groups = useMemo(
    () => (Array.isArray(product.options) ? product.options.filter((g) => g.choices?.length > 0) : []),
    [product.options],
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initialSelection(groups));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function toggleChoice(group: ProductOptionGroup, choiceId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === 'single') {
        // Requerido: siempre hay una elegida. Opcional: tocar de nuevo deselecciona.
        const next = current.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(choiceId)) {
        return { ...prev, [group.id]: current.filter((c) => c !== choiceId) };
      }
      if (group.max && group.max > 0 && current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, choiceId] };
    });
  }

  const chosenOptions: CartItemOption[] = useMemo(() => {
    const out: CartItemOption[] = [];
    for (const g of groups) {
      for (const choiceId of selected[g.id] ?? []) {
        const c = g.choices.find((x) => x.id === choiceId);
        if (c) out.push({ groupId: g.id, groupName: g.name, choiceId: c.id, choiceName: c.name, priceDelta: Number(c.priceDelta) || 0 });
      }
    }
    return out;
  }, [groups, selected]);

  const unitPrice = product.price + chosenOptions.reduce((s, o) => s + o.priceDelta, 0);
  const missingRequired = groups.some(
    (g) => g.type === 'single' && g.required && (selected[g.id] ?? []).length === 0,
  );

  function add() {
    if (missingRequired) return;
    addItem(
      {
        productId: product.id,
        name: product.name,
        price: unitPrice,
        image_url: product.image_url,
        options: chosenOptions.length > 0 ? chosenOptions : undefined,
      },
      qty,
    );
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

          {/* ── Variantes / extras ── */}
          {groups.map((group) => {
            const picked = selected[group.id] ?? [];
            const hint =
              group.type === 'single'
                ? group.required ? content.product.chooseOne : content.product.optional
                : group.max && group.max > 0
                  ? `${content.product.optional} · máx ${group.max}`
                  : content.product.optional;
            return (
              <div key={group.id} style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{group.name}</span>
                  <span className="t-kicker" style={{ fontSize: 9.5 }}>{hint}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {group.choices.map((choice) => {
                    const on = picked.includes(choice.id);
                    const delta = Number(choice.priceDelta) || 0;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => toggleChoice(group, choice.id)}
                        className="press"
                        aria-pressed={on}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 99, cursor: 'pointer',
                          background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.05)',
                          color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                          border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                          fontWeight: 600, fontSize: 13, transition: 'all 140ms',
                        }}
                      >
                        {on && <Icon name="check" size={13} strokeWidth={3} />}
                        {choice.name}
                        {delta !== 0 && (
                          <span className="t-mono" style={{ fontSize: 11.5, opacity: 0.75 }}>
                            {delta > 0 ? '+' : '−'}{formatPrice(Math.abs(delta), config)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Acción */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
          {ordersEnabled ? (
            <>
              <QtyStepper value={qty} size="lg" onMinus={() => setQty(Math.max(1, qty - 1))} onPlus={() => setQty(qty + 1)} />
              <PrimaryButton size="lg" full onClick={add} style={{ flex: 1, opacity: missingRequired ? 0.55 : 1 }}>
                {content.product.add} · <span className="t-mono" style={{ fontWeight: 700 }}>{formatPrice(unitPrice * qty, config)}</span>
              </PrimaryButton>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <Price amount={unitPrice} size={24} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
