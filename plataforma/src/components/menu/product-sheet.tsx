'use client';

/* Detalle de producto en bottom-sheet. Arte (foto o BrandPattern), tags,
   tiempo de preparación, grupos de opciones (variantes/extras), stepper y
   botón agregar. El precio del botón refleja base + opciones en vivo. */

import AssetImage from '@/components/asset-image';
import { PRODUCT_ART_SIZES } from '@/lib/asset-image';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Tag, QtyStepper, PrimaryButton, Price } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import { useLocale, useLocalized } from '@/lib/locale/context';
import type { CartItemOption, Product, ProductOptionGroup } from '@/types';

type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'>;

/** Selección inicial: single requeridos arrancan con su primera opción; combo arranca con todas. */
function initialSelection(groups: ProductOptionGroup[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    if (g.type === 'combo') {
      sel[g.id] = g.choices.map((c) => c.id);
    } else if (g.type === 'single' && g.required && g.choices.length > 0) {
      sel[g.id] = [g.choices[0].id];
    } else {
      sel[g.id] = [];
    }
  }
  return sel;
}

/** Variante inicial de cada componente con variantes: la primera. El precio
    SIEMPRE usó la primera como fallback — sin esto, la píldora no se veía
    marcada aunque ya se estuviera cobrando esa variante. */
function initialVariants(groups: ProductOptionGroup[]): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups) {
    for (const c of g.choices) {
      if (c.variants?.length) sel[c.id] = c.variants[0].id;
    }
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
  const titleT = useText('heading', 'productTitle');
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [heroReady, setHeroReady] = useState(false);
  const { locale } = useLocale();
  const name = useLocalized(product.name, product.name_en);
  const description = useLocalized(product.description ?? '', product.description_en);

  const groups = useMemo(
    () => (Array.isArray(product.options) ? product.options.filter((g) => g.choices?.length > 0) : []),
    [product.options],
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initialSelection(groups));
  /** choiceId -> variantId elegida (solo choices de combo con variantes). */
  const [variantSelected, setVariantSelected] = useState<Record<string, string>>(() => initialVariants(groups));
  /** Grupo obligatorio sin responder que hay que señalar. Antes el botón
      "Agregar" simplemente no hacía nada (solo bajaba de opacidad) y el
      comensal se quedaba tocándolo sin saber qué le faltaba. */
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function toggleChoice(group: ProductOptionGroup, choiceId: string) {
    setMissingGroupId((m) => (m === group.id ? null : m));
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === 'single') {
        // Requerido: siempre hay una elegida. Opcional: tocar de nuevo deselecciona.
        const next = current.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: next };
      }
      // combo y multi: toggle libre
      if (current.includes(choiceId)) {
        return { ...prev, [group.id]: current.filter((c) => c !== choiceId) };
      }
      // solo multi tiene límite máximo
      if (group.type === 'multi' && group.max && group.max > 0 && current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, choiceId] };
    });
    // Al incluir un componente con variantes por primera vez, preselecciona la
    // primera (igual que un grupo 'single' requerido) para no frenar al que
    // no tiene preferencia; el que sí quiere elegir la cambia con las píldoras.
    const choice = group.choices.find((c) => c.id === choiceId);
    if (choice?.variants?.length && !variantSelected[choiceId]) {
      setVariantSelected((prev) => ({ ...prev, [choiceId]: choice.variants![0].id }));
    }
  }

  function chooseVariant(choiceId: string, variantId: string) {
    setVariantSelected((prev) => ({ ...prev, [choiceId]: variantId }));
  }

  const chosenOptions: CartItemOption[] = useMemo(() => {
    const out: CartItemOption[] = [];
    for (const g of groups) {
      for (const choiceId of selected[g.id] ?? []) {
        const c = g.choices.find((x) => x.id === choiceId);
        if (!c) continue;
        const variant = c.variants?.length
          ? c.variants.find((v) => v.id === variantSelected[c.id]) ?? c.variants[0]
          : undefined;
        const priceDelta = (Number(c.priceDelta) || 0) + (variant ? Number(variant.priceDelta) || 0 : 0);
        out.push({
          groupId: g.id, groupName: g.name, choiceId: c.id, choiceName: c.name, priceDelta,
          ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
        });
      }
    }
    return out;
  }, [groups, selected, variantSelected]);

  const unitPrice = product.price + chosenOptions.reduce((s, o) => s + o.priceDelta, 0);
  const firstMissing = groups.find(
    (g) => g.type === 'single' && g.required && (selected[g.id] ?? []).length === 0,
  ) ?? null;
  const missingRequired = firstMissing !== null;

  function add() {
    if (firstMissing) {
      // Señala EL grupo que falta y lo trae a la vista, en vez de no hacer nada.
      setMissingGroupId(firstMissing.id);
      document.getElementById(`optgrp-${firstMissing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
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
      className="menu-sheet-wrap"
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      {/* `.menu-sheet`: hoja pegada al borde inferior en el teléfono y diálogo
          centrado de tablet para arriba. Ver globals.css. */}
      <div
        className="glass anim-slide-up menu-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '18px 20px 24px', overflowY: 'auto' }}
      >
        <button
          onClick={onClose}
          className="press glass-quiet"
          style={{ position: 'absolute', top: 'var(--m-sp-4)', right: 'var(--m-sp-4)', zIndex: 2, minWidth: 'var(--m-tap)', minHeight: 'var(--m-tap)', borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}
          aria-label="Cerrar"
        >
          <Icon name="x" size={18} />
        </button>

        {/* Hero */}
        <div style={{ borderRadius: 'var(--m-r-xl)', overflow: 'hidden', position: 'relative', aspectRatio: '1.5', background: 'var(--surface-1)', border: '1px solid var(--u-hair)' }}>
          {usePhoto ? (
            <>
              {/* Capa de fondo: la MISMA foto que la tarjeta que se acaba de
                  tocar (mismo `sizes` → mismo archivo) — ya está en la caché
                  del navegador y se pinta al instante. Antes la ficha pedía
                  otra más grande y el hueco se quedaba vacío mientras
                  llegaba. La nítida entra encima con un fundido. */}
              <AssetImage src={product.image_url!} alt="" aria-hidden fill loading="eager" style={{ objectFit: 'cover' }} sizes={PRODUCT_ART_SIZES} />
              <AssetImage
                src={product.image_url!}
                alt={name}
                fill
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 500px) 92vw, 460px"
                onLoad={() => setHeroReady(true)}
                style={{ objectFit: 'cover', opacity: heroReady ? 1 : 0, transition: 'opacity 180ms ease-out' }}
              />
            </>
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
          <h2 className="t-display" style={{ ...titleT.vars, fontSize: 28 * titleT.size }}>{name}</h2>
          {description && (
            <p className="t-serif" style={{ fontSize: 'var(--m-fs-lg)', lineHeight: 1.4 }}>{description}</p>
          )}
          {product.dietary_tags && product.dietary_tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {product.dietary_tags.map((k) => {
                const t = DIETARY_TAG_MAP[k];
                if (!t) return null;
                return (
                  <span
                    key={k}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--m-r-pill)',
                      background: 'var(--surface-2)', border: '1px solid var(--u-hair)', fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-2)',
                    }}
                  >
                    <span aria-hidden>{t.icon}</span> {locale === 'en' ? t.labelEn : t.label}
                  </span>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            {[{ i: 'clock', t: content.product.prepTime }, { i: 'flame', t: content.product.fresh }].map((x, k) => (
              <div key={k} className="m-surface" style={{ borderRadius: 'var(--m-r-md)', padding: 'var(--m-sp-3)', display: 'flex', alignItems: 'center', gap: 'var(--m-sp-2)', flex: 1 }}>
                <Icon name={x.i} size={16} style={{ color: 'var(--u-text-2)' }} />
                <span style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', fontWeight: 500 }}>{x.t}</span>
              </div>
            ))}
          </div>

          {/* ── Variantes / extras / combo ── */}
          {groups.map((group) => {
            const picked = selected[group.id] ?? [];
            const isCombo = group.type === 'combo';
            const hint = isCombo
              ? 'Personaliza tu combo'
              : group.type === 'single'
                ? group.required ? content.product.chooseOne : content.product.optional
                : group.max && group.max > 0
                  ? `${content.product.optional} · máx ${group.max}`
                  : content.product.optional;
            const required = group.type === 'single' && !!group.required;
            const missing = missingGroupId === group.id;
            return (
              /* Mismas clases que el modal del mesero (ver .opt-* en globals.css):
                 una sola definición del selector de opciones para las dos caras
                 del producto. El estado "elegido" usa el acento del restaurante,
                 no un verde suelto ni una píldora negra. */
              <div key={group.id} id={`optgrp-${group.id}`} className="opt-group" style={{ marginTop: 4 }}>
                <div className="opt-head">
                  <span className="opt-title">{group.name}</span>
                  <span className="opt-hint" data-required={required ? '1' : '0'}>{hint}</span>
                </div>

                {missing && (
                  <div className="note note-warn" style={{ marginBottom: 10 }}>
                    <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {content.product.chooseOne}: {group.name}
                  </div>
                )}

                {isCombo ? (
                  /* ── Combo: filas con checkmark, precio visible como ahorro al quitar ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.choices.map((choice) => {
                      const included = picked.includes(choice.id);
                      const delta = Number(choice.priceDelta) || 0;
                      return (
                        <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <button
                            type="button"
                            onClick={() => toggleChoice(group, choice.id)}
                            className="press opt-row"
                            aria-pressed={included}
                          >
                            <span className="opt-check">
                              {included && <Icon name="check" size={12} strokeWidth={3} />}
                            </span>
                            <span className="opt-row-name">{choice.name}</span>
                            {delta > 0 && (
                              <span className="opt-row-delta">
                                {included ? `+${formatPrice(delta, config)}` : `−${formatPrice(delta, config)}`}
                              </span>
                            )}
                          </button>
                          {included && choice.variants && choice.variants.length > 0 && (
                            <div className="opt-variants">
                              {choice.variants.map((variant) => {
                                const on = variantSelected[choice.id] === variant.id;
                                const vDelta = Number(variant.priceDelta) || 0;
                                return (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); chooseVariant(choice.id, variant.id); }}
                                    className="press opt-pill opt-pill-sm"
                                    aria-pressed={on}
                                  >
                                    {variant.name}
                                    {vDelta !== 0 && (
                                      // .opt-delta hereda el color de la píldora a propósito: con
                                      // la clase `t-mono`, la regla `.themed-type .t-mono` forzaba
                                      // color = --u-text y el precio desaparecía al elegirla.
                                      <span className="opt-delta">
                                        {vDelta > 0 ? '+' : '−'}{formatPrice(Math.abs(vDelta), config)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Single / Multi: píldoras ── */
                  <div className="opt-pills">
                    {group.choices.map((choice) => {
                      const on = picked.includes(choice.id);
                      const delta = Number(choice.priceDelta) || 0;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => toggleChoice(group, choice.id)}
                          className="press opt-pill"
                          aria-pressed={on}
                        >
                          {on && <Icon name="check" size={13} strokeWidth={3} />}
                          {choice.name}
                          {delta !== 0 && (
                            <span className="opt-delta">
                              {delta > 0 ? '+' : '−'}{formatPrice(Math.abs(delta), config)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
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
                {content.product.add} · <span className="t-mono" style={{ fontWeight: 700, color: 'inherit' }}>{formatPrice(unitPrice * qty, config)}</span>
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
