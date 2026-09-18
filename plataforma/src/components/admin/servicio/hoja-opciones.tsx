'use client';

/* LA HOJA DE OPCIONES DE UN PLATO.
   ------------------------------------------------------------------
   Se abre desde «Opciones» de una tarjeta o desde el ✎ de una línea sin
   enviar. Grupos de chips, nota para cocina, cantidad y un CTA que dice
   lo que va a costar CON los extras dentro — que es el número que el
   mesero le repite al cliente.

   Es una hoja NUEVA y no la de antes (`waiter/product-options-modal.tsx`)
   por una razón de aspecto y ninguna de lógica: la anterior es un diálogo
   centrado con su propio vocabulario visual (glass, píldoras con check,
   pesos 700-800) y aquí desentonaba de forma evidente —se veía pegada—.
   La LÓGICA sí es la misma, a propósito: qué viene marcado por omisión,
   cómo se reconstruye una línea que se está editando, los combos con
   variantes y el grupo obligatorio sin responder. Eso estaba bien y
   probado, y volver a inventarlo solo habría añadido formas nuevas de
   equivocarse.

   Lo que el handoff no contemplaba y aquí sí:
     · COMBOS con componentes que se quitan y variantes por componente;
     · un grupo OBLIGATORIO sin responder, señalado en la propia hoja (y
       no con un `alert()` del sistema operativo, como se llegó a hacer). */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { Hoja, HojaHead, Kicker, Mono } from '@/components/admin/servicio/pieces';
import { money as fmtMoney, newLineId, type CartLine } from '@/components/admin/waiter/cart';
import type { PanelCurrency } from '@/components/admin/order-card';
import type { Product, ProductOptionGroup } from '@/types';

/** Sin `line`: los valores por omisión (single obligatorio → la primera;
    combo → todo incluido). Con `line`: la selección exacta que tenía. */
function seleccionInicial(groups: ProductOptionGroup[], line?: CartLine): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    if (line) {
      sel[g.id] = line.options.filter((o) => o.groupId === g.id).map((o) => o.choiceId);
      continue;
    }
    if (g.type === 'combo') sel[g.id] = g.choices.map((c) => c.id);
    else if (g.type === 'single' && g.required && g.choices.length > 0) sel[g.id] = [g.choices[0].id];
    else sel[g.id] = [];
  }
  return sel;
}

/** La variante de cada componente: la de la línea que se edita, o la
    primera — el precio ya la usaba de respaldo, así que el chip tiene que
    verse marcado desde el principio. */
function variantesIniciales(groups: ProductOptionGroup[], line?: CartLine): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups) {
    for (const c of g.choices) {
      const guardada = line?.options.find((o) => o.choiceId === c.id)?.variantId;
      if (guardada) { sel[c.id] = guardada; continue; }
      if (!line && c.variants?.length) sel[c.id] = c.variants[0].id;
    }
  }
  return sel;
}

export interface HojaOpcionesProps {
  product: Product;
  currency: PanelCurrency;
  /** Si viene, la hoja EDITA esa línea en vez de agregar una nueva. */
  initialLine?: CartLine;
  /** Con qué cantidad abre. Viene del buscador cuando se tecleó «3 lim». */
  initialQty?: number;
  onAdd: (line: CartLine) => void;
  onSave: (lineId: string, line: Omit<CartLine, 'lineId'>) => void;
  onClose: () => void;
}

export default function HojaOpciones({
  product, currency, initialLine, initialQty = 1, onAdd, onSave, onClose,
}: HojaOpcionesProps) {
  /* En un `useMemo` y no suelto: `?? []` crea un array nuevo en cada
     render, y con él dentro de las dependencias el precio de la línea se
     recalculaba en todos. */
  const groups: ProductOptionGroup[] = useMemo(
    () => (product.options as ProductOptionGroup[] | null) ?? [],
    [product.options],
  );

  const [selected, setSelected] = useState(() => seleccionInicial(groups, initialLine));
  const [variantes, setVariantes] = useState(() => variantesIniciales(groups, initialLine));
  const [qty, setQty] = useState(initialLine?.quantity ?? initialQty);
  const [nota, setNota] = useState(initialLine?.note ?? '');
  const [falta, setFalta] = useState<string | null>(null);

  const money = (n: number) => fmtMoney(n, currency);

  function marcar(group: ProductOptionGroup, choiceId: string) {
    setFalta((f) => (f === group.id ? null : f));
    setSelected((prev) => {
      const actual = prev[group.id] ?? [];
      if (group.type === 'single') {
        // Un obligatorio no se puede dejar vacío tocando el que ya estaba.
        const siguiente = actual.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: siguiente };
      }
      if (actual.includes(choiceId)) return { ...prev, [group.id]: actual.filter((c) => c !== choiceId) };
      if (group.type === 'multi' && group.max && group.max > 0 && actual.length >= group.max) return prev;
      return { ...prev, [group.id]: [...actual, choiceId] };
    });
    const choice = group.choices.find((c) => c.id === choiceId);
    if (choice?.variants?.length && !variantes[choiceId]) {
      setVariantes((prev) => ({ ...prev, [choiceId]: choice.variants![0].id }));
    }
  }

  const opciones = useMemo((): CartLine['options'] => {
    const out: CartLine['options'] = [];
    for (const group of groups) {
      for (const choiceId of selected[group.id] ?? []) {
        const choice = group.choices.find((c) => c.id === choiceId);
        if (!choice) continue;
        const variante = choice.variants?.length
          ? choice.variants.find((v) => v.id === variantes[choice.id]) ?? choice.variants[0]
          : undefined;
        out.push({
          groupId: group.id, groupName: group.name,
          choiceId: choice.id, choiceName: choice.name,
          priceDelta: (Number(choice.priceDelta) || 0) + (variante ? Number(variante.priceDelta) || 0 : 0),
          ...(variante ? { variantId: variante.id, variantName: variante.name } : {}),
        });
      }
    }
    return out;
  }, [groups, selected, variantes]);

  const unidad = product.price + opciones.reduce((s, o) => s + o.priceDelta, 0);

  function confirmar() {
    const sinResponder = groups.find(
      (g) => g.type === 'single' && g.required && !(selected[g.id]?.length),
    );
    if (sinResponder) {
      setFalta(sinResponder.id);
      document.getElementById(`sv-grupo-${sinResponder.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const limpia = nota.trim() || undefined;
    if (initialLine) {
      onSave(initialLine.lineId, {
        productId: product.id, name: product.name, price: unidad,
        quantity: qty, options: opciones, note: limpia,
      });
      return;
    }
    /* UNA línea con la cantidad dentro, no N líneas de uno. Así el ± de la
       comanda y el agrupado por firma tratan esto como lo que es: cuatro
       del mismo plato con las mismas opciones. */
    onAdd({
      lineId: newLineId(product.id),
      productId: product.id, name: product.name, price: unidad,
      quantity: qty, options: opciones, note: limpia,
    });
  }

  return (
    <Hoja onClose={onClose} label={`Opciones de ${product.name}`}>
      <div className="sv-sheet-pad">
        <HojaHead
          title={product.name}
          sub={<Mono size={13} weight={500} color="var(--u-text-3)">{money(unidad)} c/u</Mono>}
          onClose={onClose}
        />

        {groups.map((group) => {
          const marcadas = selected[group.id] ?? [];
          const combo = group.type === 'combo';
          const obligatorio = group.type === 'single' && !!group.required;
          const pista = combo ? 'quita lo que no lleve'
            : obligatorio ? 'elige uno'
            : group.max && group.max > 0 ? `máx. ${group.max}` : 'opcional';

          return (
            <div key={group.id} id={`sv-grupo-${group.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Kicker tone={falta === group.id ? 'warn' : undefined}>
                {group.name} · {pista}
              </Kicker>

              {falta === group.id && (
                <div className="sv-hint">Falta elegir {group.name.toLowerCase()}.</div>
              )}

              <div className="sv-opts-row">
                {group.choices.map((choice) => {
                  const on = marcadas.includes(choice.id);
                  const d = Number(choice.priceDelta) || 0;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className="sv-opt"
                      data-on={on ? '1' : '0'}
                      aria-pressed={on}
                      onClick={() => marcar(group, choice.id)}
                    >
                      {/* En un combo todo viene incluido, así que lo que el
                          chip marca es «esto SÍ va»: sin el visto, quitar un
                          componente y no quitarlo se ven casi igual. */}
                      {combo && on && <Icon name="check" size={14} />}
                      {choice.name}
                      {d !== 0 && (
                        <span className="sv-opt-extra">
                          {combo && !on ? `−${money(Math.abs(d))}` : `${d > 0 ? '+' : '−'}${money(Math.abs(d))}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Las variantes de un componente del combo: sabor de bebida,
                  tamaño. Solo salen si ese componente está dentro. */}
              {combo && group.choices.map((choice) => {
                if (!marcadas.includes(choice.id) || !choice.variants?.length) return null;
                return (
                  <div key={`v-${choice.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500 }}>{choice.name}</span>
                    <div className="sv-opts-row">
                      {choice.variants.map((v) => {
                        const on = variantes[choice.id] === v.id;
                        const d = Number(v.priceDelta) || 0;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className="sv-opt"
                            data-on={on ? '1' : '0'}
                            style={{ minHeight: 40, fontSize: 13.5 }}
                            aria-pressed={on}
                            onClick={() => setVariantes((prev) => ({ ...prev, [choice.id]: v.id }))}
                          >
                            {v.name}
                            {d !== 0 && (
                              <span className="sv-opt-extra">{d > 0 ? '+' : '−'}{money(Math.abs(d))}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>Nota para cocina</Kicker>
          <input
            className="sv-field"
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 140))}
            placeholder="Ej. la salsa aparte"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="sv-step"
              style={{ width: 50, height: 50 }}
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              aria-label="Uno menos"
            >
              <Icon name="minus" size={18} />
            </button>
            <div style={{ minWidth: 40, textAlign: 'center' }}>
              <Mono size={20}>{qty}</Mono>
            </div>
            <button
              type="button"
              className="sv-step"
              style={{ width: 50, height: 50 }}
              onClick={() => setQty((n) => Math.min(99, n + 1))}
              aria-label="Uno más"
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
          <button type="button" className="sv-cta" onClick={confirmar}>
            {initialLine ? 'Guardar' : 'Agregar'} · {money(unidad * qty)}
          </button>
        </div>
      </div>
    </Hoja>
  );
}
