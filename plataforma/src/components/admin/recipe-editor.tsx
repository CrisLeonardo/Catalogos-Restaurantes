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
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  color: 'var(--u-text)',
  fontSize: 13,
  outline: 'none',
};

export default function RecipeEditor({ productId, restaurantId, ingredients, initialRecipe, onCostChange }: Props) {
  const [lines, setLines] = useState<RecipeItem[]>(initialRecipe);
  const [selIngredient, setSelIngredient] = useState('');
  const [selQty, setSelQty] = useState('');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCost = lines.reduce((acc, l) => acc + l.line_cost, 0);

  function notifyParent(newLines: RecipeItem[]) {
    if (onCostChange) {
      const total = newLines.reduce((acc, l) => acc + l.line_cost, 0);
      onCostChange(newLines.length > 0 ? total : null);
    }
  }

  function addLine() {
    if (!selIngredient || !selQty || parseFloat(selQty) <= 0) return;
    const ing = ingredients.find((i) => i.id === selIngredient);
    if (!ing) return;
    // Prevenir duplicados
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Lista de líneas */}
      {lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lines.map((l) => (
            <div
              key={l.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px 80px 32px', gap: 8, alignItems: 'center' }}
            >
              <span style={{ fontSize: 13, color: 'var(--u-text)' }}>{l.ingredient_name}</span>
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                defaultValue={l.quantity}
                onBlur={(e) => updateQty(l.id, e.target.value)}
                style={{ ...inputStyle, textAlign: 'right' }}
              />
              <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{l.ingredient_unit}</span>
              <span style={{ fontSize: 12, color: 'var(--u-text-3)', textAlign: 'right', fontFamily: 'monospace' }}>
                Q {l.line_cost.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(220,50,50,0.2)', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#f87171' }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--u-hair)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Costo total:{' '}
              <span style={{ color: 'var(--brand-accent)', fontFamily: 'monospace' }}>Q {totalCost.toFixed(4)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Agregar ingrediente */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8 }}>
        <select
          value={selIngredient}
          onChange={(e) => setSelIngredient(e.target.value)}
          style={inputStyle}
        >
          <option value="">Seleccionar insumo…</option>
          {ingredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name} ({ing.unit})
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0.0001"
          step="0.0001"
          placeholder="Cantidad"
          value={selQty}
          onChange={(e) => setSelQty(e.target.value)}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
        <button
          type="button"
          onClick={addLine}
          className="press"
          style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)', whiteSpace: 'nowrap' }}
        >
          + Agregar
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>
      )}

      {/* Guardar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="press btn-accent"
          style={{ padding: '8px 20px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
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
