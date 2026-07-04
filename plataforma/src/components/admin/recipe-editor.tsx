'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { saveProductRecipe, type RecipeLineInput } from '@/lib/actions/recipes';
import type { Ingredient, RecipeItem } from '@/lib/db/recipes';

interface Props {
  productId: string;
  restaurantId: string;
  ingredients: Ingredient[];
  initialRecipe: RecipeItem[];
  onCostChange?: (cost: number | null) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 11px',
  color: 'var(--u-text)',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--u-text-4)',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  marginBottom: 5,
  display: 'block',
};

export default function RecipeEditor({ productId, restaurantId, ingredients, initialRecipe, onCostChange }: Props) {
  const [lines, setLines] = useState<RecipeItem[]>(initialRecipe);
  const [selIngredient, setSelIngredient] = useState('');
  const [selQty, setSelQty] = useState('');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIng = ingredients.find((i) => i.id === selIngredient);
  const totalCost = lines.reduce((acc, l) => acc + l.line_cost, 0);
  const hasZeroCost = lines.some((l) => l.ingredient_cost <= 0);
  const canAdd = !!selIngredient && !!selQty && parseFloat(selQty) > 0;

  function notifyParent(newLines: RecipeItem[]) {
    if (onCostChange) {
      const total = newLines.reduce((acc, l) => acc + l.line_cost, 0);
      onCostChange(newLines.length > 0 ? total : null);
    }
  }

  function addLine() {
    if (!canAdd) return;
    const ing = ingredients.find((i) => i.id === selIngredient);
    if (!ing) return;
    if (lines.some((l) => l.ingredient_id === selIngredient)) {
      setError('Ese ingrediente ya está en la receta. Edita la cantidad directamente.');
      return;
    }
    const qty = parseFloat(selQty);
    const newLine: RecipeItem = {
      id: crypto.randomUUID(),
      product_id: productId,
      ingredient_id: ing.id,
      quantity: qty,
      ingredient_name: ing.name,
      ingredient_unit: ing.unit,
      ingredient_cost: ing.cost_per_unit,
      line_cost: qty * ing.cost_per_unit,
    };
    const next = [...lines, newLine];
    setLines(next);
    setSelIngredient('');
    setSelQty('');
    setError(null);
    setSaved(false);
    notifyParent(next);
  }

  function updateQty(lineId: string, rawQty: string) {
    const qty = parseFloat(rawQty);
    const next = lines.map((l) =>
      l.id === lineId
        ? { ...l, quantity: isNaN(qty) ? l.quantity : qty, line_cost: isNaN(qty) ? l.line_cost : qty * l.ingredient_cost }
        : l,
    );
    setLines(next);
    setSaved(false);
    notifyParent(next);
  }

  function removeLine(lineId: string) {
    const next = lines.filter((l) => l.id !== lineId);
    setLines(next);
    setSaved(false);
    notifyParent(next);
  }

  function handleSave() {
    setError(null);
    const toSave: RecipeLineInput[] = lines.map((l) => ({
      ingredient_id: l.ingredient_id,
      quantity: l.quantity,
    }));
    startTransition(async () => {
      const res = await saveProductRecipe(productId, restaurantId, toSave);
      if (res?.error) { setError(res.error); return; }
      setSaved(true);
    });
  }

  if (ingredients.length === 0) {
    return (
      <div style={{ padding: '14px 0', color: 'var(--u-text-3)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="flask" size={16} />
        <span>
          Aún no tienes insumos registrados.{' '}
          <a href="/admin/ingredientes" style={{ color: 'var(--brand-accent)', textDecoration: 'none' }}>
            Crea tus insumos
          </a>{' '}
          para armar la receta de este platillo.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Lista de líneas */}
      {lines.length > 0 && (
        <div style={{ border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Encabezados — .recipe-line: columnas más angostas en móvil */}
          <div className="recipe-line" style={{
            padding: '7px 12px',
            background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
            borderBottom: '1px solid var(--u-hair)',
          }}>
            {['Insumo', 'Cantidad', 'Costo', ''].map((h) => (
              <span key={h} style={{ fontSize: 10, color: 'var(--u-text-4)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>

          {/* Filas */}
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="recipe-line"
              style={{
                padding: '10px 12px',
                borderBottom: i < lines.length - 1 ? '1px solid var(--u-hair)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.ingredient_name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--u-text-4)', flexShrink: 0 }}>
                  {l.ingredient_unit}
                </span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0.0001"
                step="0.0001"
                defaultValue={l.quantity}
                onBlur={(e) => updateQty(l.id, e.target.value)}
                style={{ ...inputStyle, textAlign: 'right', padding: '6px 10px', width: '100%' }}
              />
              <span
                style={{
                  fontSize: 12.5,
                  color: l.ingredient_cost <= 0 ? '#fbbf24' : 'var(--u-text-2)',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: 500,
                }}
                title={l.ingredient_cost <= 0 ? 'Este insumo tiene costo 0 — actualízalo en Ingredientes' : undefined}
              >
                Q {l.line_cost.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                className="press"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid rgba(220,50,50,0.15)',
                  background: 'rgba(220,50,50,0.05)',
                  cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                  color: '#f87171',
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}

          {/* Total */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--u-text) 2.5%, transparent)',
            borderTop: '1px solid var(--u-hair)',
          }}>
            {hasZeroCost && (
              <span style={{ fontSize: 11, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4, marginRight: 'auto' }}>
                <Icon name="alertCircle" size={11} /> Insumos con costo Q0
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>Costo total:</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-accent)', fontFamily: 'monospace' }}>
              Q {totalCost.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Formulario agregar ingrediente */}
      <div style={{
        border: '1px dashed var(--u-hair-2)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
      }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
          Agregar ingrediente
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Insumo */}
          <div>
            <label style={labelStyle}>Insumo</label>
            <select
              value={selIngredient}
              onChange={(e) => setSelIngredient(e.target.value)}
              style={{ ...inputStyle, color: selIngredient ? 'var(--u-text)' : 'var(--u-text-4)' }}
            >
              <option value="">Seleccionar insumo…</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id} style={{ color: '#111', background: '#fff' }}>
                  {ing.name} ({ing.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, maxWidth: 180 }}>
              <label style={labelStyle}>
                Cantidad{selectedIng ? ` (${selectedIng.unit})` : ''}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0.0001"
                step="0.0001"
                placeholder="0.00"
                value={selQty}
                onChange={(e) => setSelQty(e.target.value)}
                style={inputStyle}
              />
            </div>
            {selectedIng && selQty && parseFloat(selQty) > 0 && (
              <div style={{
                padding: '9px 12px',
                background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                color: 'var(--u-text-3)',
                whiteSpace: 'nowrap',
                border: '1px solid var(--u-hair)',
                fontFamily: 'monospace',
              }}>
                {parseFloat(selQty).toFixed(selectedIng.unit === 'g' || selectedIng.unit === 'ml' ? 0 : 2)} {selectedIng.unit}
              </div>
            )}
          </div>

          {/* Botón agregar */}
          <button
            type="button"
            onClick={addLine}
            disabled={!canAdd}
            className="press btn-accent"
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: canAdd ? 'pointer' : 'not-allowed',
              fontSize: 13.5,
              fontWeight: 600,
              opacity: canAdd ? 1 : 0.4,
              transition: 'opacity 150ms',
              alignSelf: 'flex-start',
            }}
          >
            + Agregar a la receta
          </button>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#f87171', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="alertCircle" size={12} /> {error}
        </p>
      )}

      {/* Guardar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="press btn-accent"
          style={{ padding: '9px 22px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? 'Guardando…' : 'Guardar receta'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={13} /> Guardado
          </span>
        )}
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Eliminar toda la receta? El costo volverá a ser manual.')) {
                setLines([]);
                setSaved(false);
                notifyParent([]);
                startTransition(async () => {
                  await saveProductRecipe(productId, restaurantId, []);
                  setSaved(true);
                });
              }
            }}
            style={{ marginLeft: 'auto', fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Borrar receta
          </button>
        )}
      </div>
    </div>
  );
}
