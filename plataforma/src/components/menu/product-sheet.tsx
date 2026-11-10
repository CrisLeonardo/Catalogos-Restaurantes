'use client';

/* Detalle de producto en bottom-sheet. Arte (foto o BrandPattern), tags,
   grupos de opciones (variantes/extras), stepper y botón agregar. El precio
   del botón refleja base + opciones en vivo.

   Auditoría 1.11 (M03, M04, M08, D04, D08):
     · Lo obligatorio sin predeterminada empieza vacío; la predeterminada del
       restaurante viene puesta y lo dice. Se respeta el mínimo.
     · El botón dice qué falta («Elige término») en vez de aclararse.
     · Cada grupo es un grupo de radios o de casillas para el lector.
     · Sin alérgenos indicados, se dice; nunca parece «no contiene».
     · Con `linea`, la ficha cambia esa línea del carrito («Cambiar»).
     · Sin las tarjetas fijas «8–12 min» / «Recién hecho» (decisión del
       dueño, 2026-11-09): eran iguales para todo y nadie las midió. */

import AssetImage from '@/components/asset-image';
import { PRODUCT_ART_SIZES } from '@/lib/asset-image';
import { useMemo, useState } from 'react';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Tag, QtyStepper, PrimaryButton, Price } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { useEdicion } from '@/lib/vitrina/use-edicion';
import { edicionPermitePedir, fechaCorta } from '@/lib/vitrina/edicion';
import { DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import { useLocale, useLocalized } from '@/lib/locale/context';
import { Acompanantes, type Sugerencia } from '@/components/menu/pairings';
import type { CartItem, CartItemOption, Product, ProductOptionGroup } from '@/types';
import {
  cabeOtra, grupoEsObligatorio, grupoPendiente, reglaDeGrupo, seleccionDeLinea, seleccionInicial, textoPendiente, variantesDeLinea,
} from '@/lib/menu/opciones';

type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'>;

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
  product, icon, ordersEnabled, onClose, acompanantes = [], linea, onGuardado,
}: {
  product: ProdItem;
  icon: string;
  ordersEnabled: boolean;
  onClose: () => void;
  /** «Acompáñalo con…» (CAT-13): se suman al carrito al pulsar «Agregar». */
  acompanantes?: Sugerencia[];
  /** «Cambiar» desde el carrito (1.11, M04): esta línea se reemplaza en su lugar. */
  linea?: CartItem;
  onGuardado?: () => void;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  // Vitrina en lanzamiento: fuera de la edición no se agrega (ver useEdicion).
  const edicion = useEdicion();
  const titleT = useText('heading', 'productTitle');
  const { addItem, replaceItem } = useCart();
  const [qty, setQty] = useState(linea?.quantity ?? 1);
  const [heroReady, setHeroReady] = useState(false);
  const { locale } = useLocale();
  const name = useLocalized(product.name, product.name_en);
  const description = useLocalized(product.description ?? '', product.description_en);

  const groups = useMemo(
    () => (Array.isArray(product.options) ? product.options.filter((g) => g.choices?.length > 0) : []),
    [product.options],
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(
    () => (linea ? seleccionDeLinea(groups, linea.options) : seleccionInicial(groups)),
  );
  /** choiceId -> variantId elegida (solo choices de combo con variantes). */
  const [variantSelected, setVariantSelected] = useState<Record<string, string>>(
    () => ({ ...initialVariants(groups), ...(linea ? variantesDeLinea(linea.options) : {}) }),
  );
  const es = locale !== 'en';
  /** Grupo obligatorio sin responder que hay que señalar. Antes el botón
      "Agregar" simplemente no hacía nada (solo bajaba de opacidad) y el
      comensal se quedaba tocándolo sin saber qué le faltaba. */
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);
  /** Acompañantes marcados. No se agregan al tocarlos sino con el platillo:
      cerrar la ficha sin pedir no deja una bebida suelta en el carrito. */
  const [extras, setExtras] = useState<ReadonlySet<string>>(() => new Set());

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
      if (!cabeOtra(group, prev)) return prev;
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
  const elegidos = acompanantes.filter((a) => extras.has(a.id));
  const extrasTotal = elegidos.reduce((s, a) => s + a.price, 0);

  function toggleExtra(a: Sugerencia) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
      return next;
    });
  }
  const firstMissing = grupoPendiente(groups, selected);
  const missingRequired = firstMissing !== null;

  function add() {
    if (firstMissing) {
      // Señala EL grupo que falta y lo trae a la vista, en vez de no hacer nada.
      setMissingGroupId(firstMissing.id);
      document.getElementById(`optgrp-${firstMissing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const item = {
      productId: product.id,
      name: product.name,
      price: unitPrice,
      image_url: product.image_url,
      options: chosenOptions.length > 0 ? chosenOptions : undefined,
    };
    if (linea) {
      replaceItem(linea.lineId, item, qty);
      onClose();
      onGuardado?.();
      return;
    }
    addItem(item, qty);
    for (const a of elegidos) {
      addItem({ productId: a.id, name: a.name, price: a.price, image_url: a.image_url ?? null });
    }
    onClose();
  }

  const usePhoto = product.image_url && config.productArt !== 'pattern';

  const pie = (
    <div className="hoja-platillo-accion">
      {ordersEnabled && !edicionPermitePedir(edicion) ? (
        <div className="m-sheet-closed" role="status">
          {edicion.estado === 'proxima' && edicion.abre !== null ? `Esta edición abre el ${fechaCorta(edicion.abre)}` : content.vitrina.launchClosed}
        </div>
      ) : ordersEnabled ? (
        <>
          <QtyStepper value={qty} size="lg" onMinus={() => setQty(Math.max(1, qty - 1))} onPlus={() => setQty(qty + 1)} />
          {/* Con algo pendiente el botón lo dice («Elige término») y lleva
              al grupo; antes sólo se aclaraba (D04). */}
          <PrimaryButton size="lg" full onClick={add} aria-describedby={firstMissing ? `optgrp-h-${firstMissing.id}` : undefined}
            style={{ flex: 1, ...(missingRequired ? { background: 'var(--surface-2)', color: 'var(--u-text)', boxShadow: 'inset 0 0 0 1px var(--u-hair-2)' } : {}) }}>
            {firstMissing
              ? textoPendiente(firstMissing, selected, es ? 'es' : 'en')
              : <>{linea ? (es ? 'Guardar cambios' : 'Save changes') : content.product.add} · <span className="t-mono" style={{ fontWeight: 700, color: 'inherit' }}>{formatPrice(unitPrice * qty + (linea ? 0 : extrasTotal), config)}</span></>}
          </PrimaryButton>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Price amount={unitPrice} size={24} />
        </div>
      )}
    </div>
  );

  return (
    <HojaOperativa
      label={name}
      title={<span className="t-display" style={{ ...titleT.vars, fontSize: 22 * titleT.size }}>{name}</span>}
      closeLabel={locale === 'en' ? 'Close' : 'Cerrar'}
      className="hoja-platillo"
      onClose={onClose}
      footer={pie}
    >
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
        {description && (
          <p className="hoja-platillo-descripcion">{description}</p>
        )}
        {ordersEnabled && <Price amount={unitPrice} size={22} />}
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
        {!(product.dietary_tags && product.dietary_tags.some((k) => DIETARY_TAG_MAP[k]?.kind === 'allergen')) && (
          /* Sin alérgenos indicados no se calla: callar parece «no contiene» (M08). */
          <p style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', padding: '10px 12px', borderRadius: 'var(--m-r-md)', border: '1px dashed var(--u-hair-2)' }}>
            {es
              ? 'Alérgenos: el restaurante no los ha indicado. Pregunta antes de pedir.'
              : 'Allergens: not provided by the restaurant. Ask before ordering.'}
          </p>
        )}

        {/* ── Variantes / extras / combo ── */}
        {groups.map((group) => {
          const picked = selected[group.id] ?? [];
          const isCombo = group.type === 'combo';
          // Los textos del tema («Elige uno», «Opcional») mandan donde existen;
          // la regla de varios se dice completa: «Elige de 1 a 2» (M03).
          const hint = group.type === 'single'
            ? group.required ? content.product.chooseOne : content.product.optional
            : reglaDeGrupo(group, es ? 'es' : 'en');
          const required = grupoEsObligatorio(group);
          const missing = missingGroupId === group.id;
          const tituloId = `optgrp-t-${group.id}`;
          const reglaId = `optgrp-h-${group.id}`;
          return (
            /* Mismas clases que el modal del mesero (ver .opt-* en globals.css):
               una sola definición del selector de opciones para las dos caras
               del producto. El estado "elegido" usa el acento del restaurante,
               no un verde suelto ni una píldora negra. */
            <div key={group.id} id={`optgrp-${group.id}`} className="opt-group" style={{ marginTop: 4 }}>
              <div className="opt-head">
                <span className="opt-title" id={tituloId}>{group.name}</span>
                <span className="opt-hint" id={reglaId} data-required={required ? '1' : '0'}>{hint}</span>
              </div>

              {missing && (
                <div className="note note-warn" role="alert" style={{ marginBottom: 10 }}>
                  <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {textoPendiente(group, selected, es ? 'es' : 'en')}
                </div>
              )}

              {isCombo ? (
                /* ── Combo: filas con checkmark, precio visible como ahorro al quitar ── */
                <div role="group" aria-labelledby={tituloId} aria-describedby={reglaId} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {group.choices.map((choice) => {
                    const included = picked.includes(choice.id);
                    const delta = Number(choice.priceDelta) || 0;
                    return (
                      <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <button
                          type="button"
                          onClick={() => toggleChoice(group, choice.id)}
                          className="press opt-row"
                          role="checkbox"
                          aria-checked={included}
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
                <div className="opt-pills" role={group.type === 'single' ? 'radiogroup' : 'group'} aria-labelledby={tituloId} aria-describedby={reglaId}>
                  {group.choices.map((choice) => {
                    const on = picked.includes(choice.id);
                    const delta = Number(choice.priceDelta) || 0;
                    const predeterminada = group.type === 'single' && group.defaultChoiceId === choice.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => toggleChoice(group, choice.id)}
                        className="press opt-pill"
                        role={group.type === 'single' ? 'radio' : 'checkbox'}
                        aria-checked={on}
                      >
                        {on && <Icon name="check" size={13} strokeWidth={3} />}
                        {choice.name}
                        {/* Con espacio: el lector oía «Papas· predeterminada» y «Tocino+Q10.00». */}
                        {predeterminada && (
                          <span style={{ fontSize: '0.85em', fontWeight: 500, opacity: 0.85 }}>{' '}· {es ? 'predeterminada' : 'default'}</span>
                        )}
                        {delta !== 0 && (
                          <span className="opt-delta">{' '}
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

        {ordersEnabled && !linea && (
          <Acompanantes
            items={acompanantes}
            elegidos={extras}
            onToggle={toggleExtra}
            nota={{ es: 'Se suma a tu pedido', en: 'Added to your order' }}
          />
        )}
      </div>
    </HojaOperativa>
  );
}
