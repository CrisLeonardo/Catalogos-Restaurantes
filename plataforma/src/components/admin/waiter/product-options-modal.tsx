'use client';

/* La hoja de opciones de un plato — combos, variantes y nota para cocina.
   ------------------------------------------------------------------
   Es la MISMA que ve el comensal en el menú público, a propósito: el
   mesero que recita las opciones por teléfono está leyendo la pantalla
   que el cliente tiene delante.

   Vivía dentro de waiter-panel.tsx. El rediseño de 2026-08-26 no le
   cambió una línea —lo que hace ya estaba bien y probado—; solo la sacó
   a su propio archivo, porque el panel pasó de ser una pantalla a ser un
   armazón de cuatro. */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import type { Product, ProductOptionGroup } from '@/types';
import type { PanelCurrency } from '@/components/admin/order-card';
import { money, newLineId, type CartLine } from '@/components/admin/waiter/cart';

/* ── Modal de opciones del producto (diseño igual al cliente) ── */
/** Sin `line`: valores por defecto (single/required → primera opción, combo →
    todo incluido). Con `line` (editar una línea ya agregada): reconstruye la
    selección exacta que tenía, incluyendo combos con componentes quitados. */
function initModalSelection(groups: ProductOptionGroup[], line?: CartLine): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    if (line) {
      sel[g.id] = line.options.filter((o) => o.groupId === g.id).map((o) => o.choiceId);
      continue;
    }
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

/** Variante inicial de cada componente con variantes: la de `line` si se está
    editando; si no, la primera (igual que la hoja del comensal) — el precio
    ya la usaba como fallback, la píldora debe verse marcada desde el inicio. */
function initModalVariants(groups: ProductOptionGroup[], line?: CartLine): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups) {
    for (const c of g.choices) {
      const savedVariantId = line?.options.find((o) => o.choiceId === c.id)?.variantId;
      if (savedVariantId) { sel[c.id] = savedVariantId; continue; }
      if (!line && c.variants?.length) sel[c.id] = c.variants[0].id;
    }
  }
  return sel;
}

function ProductOptionsModal({
  product,
  currency,
  initialLine,
  initialQty = 1,
  onAdd,
  onSave,
  onClose,
}: {
  product: Product;
  currency: PanelCurrency;
  /** Si viene, la hoja edita esta línea del carrito en vez de agregar una nueva. */
  initialLine?: CartLine;
  /** Cantidad con la que abre la hoja. Viene del buscador cuando se tecleó
      "3 lim": no tiene sentido volver a marcar el 3 aquí dentro. */
  initialQty?: number;
  onAdd: (line: CartLine) => void;
  onSave?: (lineId: string, line: Omit<CartLine, 'lineId'>) => void;
  onClose: () => void;
}) {
  const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initModalSelection(groups, initialLine));
  /** choiceId -> variantId elegida (solo choices de combo con variantes). */
  const [variantSelected, setVariantSelected] = useState<Record<string, string>>(() => initModalVariants(groups, initialLine));
  const [qty, setQty] = useState(initialLine?.quantity ?? initialQty);
  const [note, setNote] = useState(initialLine?.note ?? '');
  /** Grupo obligatorio sin elegir, señalado en la propia hoja. Antes esto era
      un alert() del navegador: una caja gris del sistema operativo encima de
      la app, sin decir cuál de los grupos faltaba. */
  const [missingGroupId, setMissingGroupId] = useState<string | null>(null);

  function toggleChoice(group: ProductOptionGroup, choiceId: string) {
    setMissingGroupId((m) => (m === group.id ? null : m));
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === 'single') {
        const next = current.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(choiceId)) {
        return { ...prev, [group.id]: current.filter((c) => c !== choiceId) };
      }
      if (group.type === 'multi' && group.max && group.max > 0 && current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, choiceId] };
    });
    const choice = group.choices.find((c) => c.id === choiceId);
    if (choice?.variants?.length && !variantSelected[choiceId]) {
      setVariantSelected((prev) => ({ ...prev, [choiceId]: choice.variants![0].id }));
    }
  }

  function chooseVariant(choiceId: string, variantId: string) {
    setVariantSelected((prev) => ({ ...prev, [choiceId]: variantId }));
  }

  function buildOptions() {
    const opts: CartLine['options'] = [];
    for (const group of groups) {
      for (const choiceId of selected[group.id] ?? []) {
        const choice = group.choices.find((c) => c.id === choiceId);
        if (!choice) continue;
        const variant = choice.variants?.length
          ? choice.variants.find((v) => v.id === variantSelected[choice.id]) ?? choice.variants[0]
          : undefined;
        const priceDelta = (Number(choice.priceDelta) || 0) + (variant ? Number(variant.priceDelta) || 0 : 0);
        opts.push({
          groupId: group.id, groupName: group.name, choiceId: choice.id, choiceName: choice.name, priceDelta,
          ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
        });
      }
    }
    return opts;
  }

  /** Primer grupo obligatorio sin respuesta, o null si está todo listo. */
  function firstMissingGroup(): ProductOptionGroup | null {
    for (const group of groups) {
      if (group.type === 'single' && group.required && !(selected[group.id]?.length)) return group;
    }
    return null;
  }

  function handleAdd() {
    const missing = firstMissingGroup();
    if (missing) {
      setMissingGroupId(missing.id);
      document.getElementById(`optgrp-${missing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const opts = buildOptions();
    const delta = opts.reduce((s, o) => s + o.priceDelta, 0);
    const trimmedNote = note.trim() || undefined;
    if (initialLine && onSave) {
      onSave(initialLine.lineId, {
        productId: product.id, name: product.name, price: product.price + delta,
        quantity: qty, options: opts, note: trimmedNote,
      });
    } else {
      for (let i = 0; i < qty; i++) {
        onAdd({ lineId: newLineId(product.id), productId: product.id, name: product.name, price: product.price + delta, quantity: 1, options: opts, note: trimmedNote });
      }
    }
    onClose();
  }

  const delta = buildOptions().reduce((s, o) => s + o.priceDelta, 0);
  const finalPrice = product.price + delta;

  return (
    <div onClick={onClose} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      {/* `role` y `aria-modal` (M-29). Esta es la hoja que más se abre del
          panel —decenas de veces por turno— y era la única de las tres que
          no se anunciaba como diálogo: para un lector de pantalla era
          contenido normal apilado sobre la página. Las otras dos, que
          salen un par de veces por turno, sí lo declaraban. */}
      <div
        className="glass anim-slide-up waiter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones de ${product.name}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--u-hair)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)' }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
              {money(finalPrice, currency)} por unidad
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0, marginLeft: 10 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
          {groups.map((group) => {
            const picked = selected[group.id] ?? [];
            const isCombo = group.type === 'combo';
            const required = group.type === 'single' && !!group.required;
            const hint = isCombo ? 'Personaliza el combo'
              : required ? 'Elige uno'
              : group.max && group.max > 0 ? `Opcional · máx ${group.max}` : 'Opcional';
            const missing = missingGroupId === group.id;

            return (
              <div key={group.id} id={`optgrp-${group.id}`} className="opt-group">
                <div className="opt-head">
                  <span className="opt-title">{group.name}</span>
                  <span className="opt-hint" data-required={required ? '1' : '0'}>{hint}</span>
                </div>

                {missing && (
                  <div className="note note-warn" style={{ marginBottom: 10 }}>
                    <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    Falta elegir {group.name.toLowerCase()}.
                  </div>
                )}

                {isCombo ? (
                  /* Combo: filas con checkmark, precio visible como ahorro al quitar */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.choices.map((choice) => {
                      const included = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <button type="button" onClick={() => toggleChoice(group, choice.id)} aria-pressed={included} className="press opt-row">
                            <span className="opt-check">
                              {included && <Icon name="check" size={12} strokeWidth={3} />}
                            </span>
                            <span className="opt-row-name">{choice.name}</span>
                            {d > 0 && (
                              <span className="opt-row-delta">
                                {included ? `+${money(d, currency)}` : `−${money(d, currency)}`}
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
                                    aria-pressed={on}
                                    className="press opt-pill opt-pill-sm"
                                  >
                                    {variant.name}
                                    {vDelta !== 0 && (
                                      <span className="opt-delta">{vDelta > 0 ? '+' : '−'}{money(Math.abs(vDelta), currency)}</span>
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
                  /* Single / Multi: píldoras */
                  <div className="opt-pills">
                    {group.choices.map((choice) => {
                      const on = picked.includes(choice.id);
                      const d = Number(choice.priceDelta) || 0;
                      return (
                        <button key={choice.id} type="button" onClick={() => toggleChoice(group, choice.id)} aria-pressed={on} className="press opt-pill">
                          {on && <Icon name="check" size={13} strokeWidth={3} />}
                          {choice.name}
                          {d !== 0 && (
                            <span className="opt-delta">{d > 0 ? '+' : '−'}{money(Math.abs(d), currency)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cantidad */}
          <div className="opt-group">
            <div className="opt-head"><span className="opt-title">Cantidad</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="button" aria-label="Quitar una" onClick={() => setQty((q) => Math.max(1, q - 1))} className="press glass-quiet" style={{ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
              <button type="button" aria-label="Agregar una" onClick={() => setQty((q) => Math.min(20, q + 1))} className="press glass-quiet" style={{ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--u-text)' }}>+</button>
            </div>
          </div>

          {/* Nota para cocina — por plato, no se confunde con la nota general
              del pedido (ej. "sin cebolla" en esta hamburguesa pero no en la
              otra que va en el mismo pedido). */}
          <div className="opt-group">
            <div className="opt-head"><span className="opt-title">Nota para cocina</span><span className="opt-hint" data-required="0">Opcional</span></div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              placeholder="Sin cebolla, término medio…"
              style={{ background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 12, padding: '12px 14px', color: 'var(--u-text)', fontSize: 15, outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--u-hair)' }}>
          <button type="button" onClick={handleAdd} className="press btn-accent" style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>{initialLine ? 'Guardar cambios' : `Agregar ${qty > 1 ? `${qty} ×` : ''}`}</span>
            <span style={{ opacity: 0.55 }}>·</span>
            <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money(finalPrice * qty, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductOptionsModal;
