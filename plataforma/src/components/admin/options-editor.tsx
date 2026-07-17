'use client';

/* ============================================================
   EDITOR DE VARIANTES / EXTRAS (panel admin)
   ------------------------------------------------------------
   Grupos de opciones por producto: "Tamaño" (elegir uno),
   "Extras" (varios, con máximo). Cada opción puede sumar al
   precio base. El comensal los ve en la hoja del producto.
   El padre guarda el estado y lo serializa en un input hidden.
   ============================================================ */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import type { ProductOptionGroup, ProductVariant } from '@/types';

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function emptyGroup(type: 'single' | 'multi' | 'combo'): ProductOptionGroup {
  return {
    id: newId(),
    name: type === 'single' ? 'Tamaño' : type === 'combo' ? 'Incluye' : 'Extras',
    type,
    required: type === 'single',
    max: type === 'multi' ? 0 : undefined,
    choices: [{ id: newId(), name: '', priceDelta: 0 }],
  };
}

/** Limpia grupos vacíos antes de guardar (sin nombre o sin opciones con nombre). */
export function cleanOptions(groups: ProductOptionGroup[]): ProductOptionGroup[] {
  return groups
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      choices: g.choices
        .map((c) => {
          const variants = (c.variants ?? [])
            .map((v) => ({ ...v, name: v.name.trim(), priceDelta: Number(v.priceDelta) || 0 }))
            .filter((v) => v.name.length > 0);
          return { ...c, name: c.name.trim(), priceDelta: Number(c.priceDelta) || 0, ...(variants.length > 0 ? { variants } : { variants: undefined }) };
        })
        .filter((c) => c.name.length > 0),
    }))
    .filter((g) => g.name.length > 0 && g.choices.length > 0);
}

const fieldStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair)',
  borderRadius: 10,
  padding: '8px 10px',
  color: 'var(--u-text)',
  fontSize: 13,
  outline: 'none',
};

export default function OptionsEditor({
  value,
  onChange,
}: {
  value: ProductOptionGroup[];
  onChange: (groups: ProductOptionGroup[]) => void;
}) {
  const groups = value;
  // Solo UI: qué choices tienen su editor de variantes desplegado.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const setGroup = (id: string, patch: Partial<ProductOptionGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const setChoice = (gId: string, cId: string, patch: { name?: string; priceDelta?: number; variants?: ProductVariant[] }) =>
    onChange(
      groups.map((g) =>
        g.id === gId
          ? { ...g, choices: g.choices.map((c) => (c.id === cId ? { ...c, ...patch } : c)) }
          : g,
      ),
    );

  function toggleExpanded(choiceId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(choiceId)) next.delete(choiceId); else next.add(choiceId);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Estado vacío: explica los 3 tipos con ejemplos antes de que existan grupos */}
      {groups.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {[
            { title: 'Elegir 1', example: '"Tamaño: chico / mediano / grande" — el cliente elige una sola opción.' },
            { title: 'Varios', example: '"Extras: queso +Q5, tocino +Q8" — puede marcar varios a la vez.' },
            { title: 'Combo', example: '"Incluye: hamburguesa + papas + bebida" — todo viene incluido y cada componente puede tener variantes (sabor de bebida, tipo de papas).' },
          ].map((t) => (
            <div key={t.title} style={{ borderRadius: 12, padding: '11px 13px', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', border: '1px dashed var(--u-hair-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-2)', marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.5 }}>{t.example}</div>
            </div>
          ))}
        </div>
      )}
      {groups.map((group) => (
        <div
          key={group.id}
          className="glass-quiet"
          style={{ borderRadius: 13, padding: 13, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {/* Nombre + tipo + borrar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={group.name}
              onChange={(e) => setGroup(group.id, { name: e.target.value })}
              placeholder="Nombre del grupo (Tamaño, Extras…)"
              style={{ ...fieldStyle, flex: 1, minWidth: 140, fontWeight: 600 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {([['single', 'Elegir 1'], ['multi', 'Varios'], ['combo', 'Combo']] as const).map(([t, lbl]) => {
                const on = group.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setGroup(group.id, {
                        type: t,
                        required: t === 'single' ? group.required ?? true : undefined,
                        max: t === 'multi' ? group.max ?? 0 : undefined,
                      })
                    }
                    className="press"
                    style={{
                      padding: '7px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                      background: on ? (t === 'combo' ? '#16a34a' : 'var(--u-text)') : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                      color: on ? (t === 'combo' ? '#fff' : 'var(--brand-bg, #0b0b0c)') : 'var(--u-text-3)',
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onChange(groups.filter((g) => g.id !== group.id))}
              className="press"
              aria-label="Quitar grupo"
              style={{
                width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'rgba(239,68,68,0.10)', color: 'var(--c-danger, #f87171)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>

          {/* Reglas del grupo */}
          {group.type === 'single' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--u-text-3)', cursor: 'pointer', width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={group.required ?? false}
                onChange={(e) => setGroup(group.id, { required: e.target.checked })}
                style={{ accentColor: 'var(--brand-accent)' }}
              />
              Obligatorio (el cliente debe elegir uno)
            </label>
          ) : group.type === 'combo' ? (
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
              Todos los componentes aparecen <strong>incluidos por defecto</strong>. El precio base del producto es el plato principal; el precio de cada componente se suma automáticamente al total que ve el cliente en el menú.
            </p>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--u-text-3)' }}>
              Máximo de opciones
              <input
                type="number" inputMode="decimal"
                min={0}
                max={20}
                value={group.max ?? 0}
                onChange={(e) => setGroup(group.id, { max: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                style={{ ...fieldStyle, width: 64, fontFamily: 'var(--ui-font-mono)' }}
              />
              <span style={{ color: 'var(--u-text-4)' }}>(0 = sin límite)</span>
            </label>
          )}

          {/* Opciones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.choices.map((choice) => {
              const isOpen = expanded.has(choice.id);
              const variantCount = choice.variants?.length ?? 0;
              return (
              <div key={choice.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={choice.name}
                    onChange={(e) => setChoice(group.id, choice.id, { name: e.target.value })}
                    placeholder={group.type === 'combo' ? 'Componente (Papas fritas, Gaseosa…)' : 'Opción (Grande, Extra queso…)'}
                    style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>{group.type === 'combo' ? 'Q' : '+'}</span>
                  <input
                    type="number" inputMode="decimal"
                    step="0.01"
                    min={group.type === 'combo' ? 0 : undefined}
                    value={choice.priceDelta}
                    onChange={(e) => setChoice(group.id, choice.id, { priceDelta: Number(e.target.value) || 0 })}
                    style={{ ...fieldStyle, width: 78, fontFamily: 'var(--ui-font-mono)' }}
                    aria-label={group.type === 'combo' ? 'Precio del componente' : 'Precio extra'}
                  />
                  {group.type === 'combo' && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(choice.id)}
                      className="press"
                      aria-label="Variantes del componente"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', height: 28, borderRadius: 8,
                        border: `1px solid ${variantCount > 0 ? 'rgba(34,197,94,0.35)' : 'var(--u-hair)'}`, cursor: 'pointer',
                        background: variantCount > 0 ? 'rgba(34,197,94,0.08)' : 'transparent',
                        color: variantCount > 0 ? 'var(--brand-accent, #22c55e)' : 'var(--u-text-4)',
                        fontSize: 11, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                    >
                      <Icon name="chevronDown" size={12} style={{ transition: 'transform 160ms', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      {variantCount > 0 ? `Variantes (${variantCount})` : 'Variantes'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setGroup(group.id, { choices: group.choices.filter((c) => c.id !== choice.id) })
                    }
                    className="press"
                    aria-label="Quitar opción"
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: 'var(--u-text-4)',
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>

                {group.type === 'combo' && isOpen && (
                  <div style={{
                    marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid var(--u-hair)',
                    display: 'flex', flexDirection: 'column', gap: 5,
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: 0 }}>
                      Si agregas variantes, el cliente/mesero debe elegir una para incluir &quot;{choice.name || 'este componente'}&quot; (ej. sabor de bebida, tipo de papas).
                    </p>
                    {(choice.variants ?? []).map((variant) => (
                      <div key={variant.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(e) => {
                            const variants = (choice.variants ?? []).map((v) => v.id === variant.id ? { ...v, name: e.target.value } : v);
                            setChoice(group.id, choice.id, { variants });
                          }}
                          placeholder="Variante (Coca-Cola, Papas rústicas…)"
                          style={{ ...fieldStyle, flex: 1, minWidth: 0, fontSize: 12.5 }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>+</span>
                        <input
                          type="number" inputMode="decimal"
                          step="0.01"
                          value={variant.priceDelta}
                          onChange={(e) => {
                            const variants = (choice.variants ?? []).map((v) => v.id === variant.id ? { ...v, priceDelta: Number(e.target.value) || 0 } : v);
                            setChoice(group.id, choice.id, { variants });
                          }}
                          style={{ ...fieldStyle, width: 68, fontFamily: 'var(--ui-font-mono)', fontSize: 12.5 }}
                          aria-label="Precio extra de la variante"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const variants = (choice.variants ?? []).filter((v) => v.id !== variant.id);
                            setChoice(group.id, choice.id, { variants });
                          }}
                          className="press"
                          aria-label="Quitar variante"
                          style={{
                            width: 24, height: 24, borderRadius: 7, border: 'none', cursor: 'pointer',
                            background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: 'var(--u-text-4)',
                            display: 'grid', placeItems: 'center', flexShrink: 0,
                          }}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const variants = [...(choice.variants ?? []), { id: newId(), name: '', priceDelta: 0 }];
                        setChoice(group.id, choice.id, { variants });
                      }}
                      className="press"
                      style={{
                        alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '5px 9px', borderRadius: 8, border: '1px dashed var(--u-hair-2)',
                        background: 'transparent', color: 'var(--u-text-3)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}
                    >
                      <Icon name="plus" size={11} /> Variante
                    </button>
                  </div>
                )}
              </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setGroup(group.id, {
                  choices: [...group.choices, { id: newId(), name: '', priceDelta: 0 }],
                })
              }
              className="press"
              style={{
                alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 11px', borderRadius: 9, border: '1px dashed var(--u-hair-2)',
                background: 'transparent', color: 'var(--u-text-3)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              <Icon name="plus" size={12} /> Opción
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onChange([...groups, emptyGroup('single')])}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
            borderRadius: 10, border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
            color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          }}
        >
          <Icon name="plus" size={13} /> Grupo &ldquo;elegir uno&rdquo; (tamaños)
        </button>
        <button
          type="button"
          onClick={() => onChange([...groups, emptyGroup('multi')])}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
            borderRadius: 10, border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
            color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          }}
        >
          <Icon name="plus" size={13} /> Grupo &ldquo;varios&rdquo; (extras)
        </button>
        <button
          type="button"
          onClick={() => onChange([...groups, emptyGroup('combo')])}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
            borderRadius: 10, border: '1px dashed var(--brand-accent, #22c55e)',
            background: 'rgba(34,197,94,0.06)', color: 'var(--brand-accent, #22c55e)',
            cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          }}
        >
          <Icon name="plus" size={13} /> Combo (componentes incluidos)
        </button>
      </div>
    </div>
  );
}
