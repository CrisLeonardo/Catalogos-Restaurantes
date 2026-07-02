'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { saveIngredient, deleteIngredient } from '@/lib/actions/recipes';
import type { Ingredient } from '@/lib/db/recipes';

const UNITS = [
  // Peso
  'g', 'kg', 'lbs', 'oz',
  // Volumen
  'ml', 'L', 'fl oz', 'galón',
  // Medidas de cocina
  'taza', 'cucharada', 'cucharadita',
  // Conteo / empaque
  'pieza', 'unidad', 'porción', 'rebanada',
  'botella', 'lata', 'caja', 'bolsa', 'paquete', 'rollo',
];

const inputStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 11px',
  color: 'var(--u-text)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
};

const optionStyle: React.CSSProperties = {
  color: '#111',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--u-text-3)',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 4,
  display: 'block',
};

interface Props {
  restaurantId: string;
  initialIngredients: Ingredient[];
  usageCounts: Record<string, number>;
}

type EditState = {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: string;
} | null;

export default function IngredientPanel({ restaurantId, initialIngredients, usageCounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Formulario nuevo
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newCost, setNewCost] = useState('');

  function resetAdd() {
    setNewName(''); setNewUnit('g'); setNewCost('');
    setShowAdd(false);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('name', newName);
    fd.set('unit', newUnit);
    fd.set('cost_per_unit', newCost);
    startTransition(async () => {
      const res = await saveIngredient(fd);
      if (res?.error) { setError(res.error); return; }
      resetAdd();
      router.refresh();
    });
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editState) return;
    setError(null);
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', editState.id);
    fd.set('name', editState.name);
    fd.set('unit', editState.unit);
    fd.set('cost_per_unit', editState.cost_per_unit);
    startTransition(async () => {
      const res = await saveIngredient(fd);
      if (res?.error) { setError(res.error); return; }
      setEditState(null);
      router.refresh();
    });
  }

  function handleDelete(ing: Ingredient) {
    const usage = usageCounts[ing.id] ?? 0;
    const confirm_msg = usage > 0
      ? `"${ing.name}" se usa en ${usage} receta(s). ¿Eliminar de todas formas?`
      : `¿Eliminar "${ing.name}"?`;
    if (!window.confirm(confirm_msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteIngredient(ing.id, restaurantId);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>
            Define los insumos y su costo por unidad. Asígnalos a platillos para calcular el food cost automáticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setEditState(null); }}
          className="press btn-accent"
          style={{ padding: '9px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          + Nuevo insumo
        </button>
      </div>


      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Formulario nuevo */}
      {showAdd && (
        <Glass variant="quiet" style={{ padding: 16 }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Nuevo insumo</p>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 10 }}>
              <div>
                <label style={labelStyle}>Nombre</label>
                <input style={inputStyle} required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Tomate roma" />
              </div>
              <div>
                <label style={labelStyle}>Unidad</label>
                <select style={inputStyle} value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                  {UNITS.map((u) => <option key={u} style={optionStyle}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Costo / unidad</label>
                <input style={inputStyle} type="number" min="0" step="0.0001" required value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="0.0000" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={isPending} className="press btn-accent" style={{ padding: '8px 20px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={resetAdd} style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'none', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-3)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        </Glass>
      )}

      {/* Tabla de ingredientes */}
      {initialIngredients.length === 0 && !showAdd ? (
        <Glass variant="quiet" style={{ padding: 32, textAlign: 'center' }}>
          <Icon name="flask" size={32} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
          <p style={{ color: 'var(--u-text-3)', fontSize: 14 }}>Aún no tienes insumos registrados.</p>
          <p style={{ color: 'var(--u-text-4)', fontSize: 12, marginTop: 4 }}>Crea tu primer insumo para poder asignarlo a las recetas de tus platillos.</p>
        </Glass>
      ) : (
        <Glass variant="quiet" style={{ overflow: 'visible' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
                {['Insumo', 'Unidad', 'Costo / unidad', 'Platillos', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialIngredients.map((ing, i) => (
                editState?.id === ing.id ? (
                  <tr key={ing.id} style={{ background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', borderBottom: '1px solid var(--u-hair)' }}>
                    <td colSpan={5} style={{ padding: '12px 14px' }}>
                      <form onSubmit={handleEdit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <label style={labelStyle}>Nombre</label>
                          <input style={inputStyle} required value={editState.name} onChange={(e) => setEditState({ ...editState, name: e.target.value })} />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={labelStyle}>Unidad</label>
                          <select style={inputStyle} value={editState.unit} onChange={(e) => setEditState({ ...editState, unit: e.target.value })}>
                            {UNITS.map((u) => <option key={u} style={optionStyle}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{ width: 140 }}>
                          <label style={labelStyle}>Costo / unidad</label>
                          <input style={inputStyle} type="number" min="0" step="0.0001" required value={editState.cost_per_unit} onChange={(e) => setEditState({ ...editState, cost_per_unit: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="submit" disabled={isPending} className="press btn-accent" style={{ padding: '8px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                            {isPending ? '…' : 'Guardar'}
                          </button>
                          <button type="button" onClick={() => setEditState(null)} style={{ padding: '8px 14px', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'none', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-3)', cursor: 'pointer' }}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={ing.id} style={{ borderBottom: i < initialIngredients.length - 1 ? '1px solid var(--u-hair)' : 'none' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 500 }}>{ing.name}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--u-text-3)' }}>{ing.unit}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>Q {Number(ing.cost_per_unit).toFixed(4)}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--u-text-3)' }}>
                      {usageCounts[ing.id] ? (
                        <span style={{ fontSize: 12, background: 'color-mix(in srgb, var(--u-text) 7%, transparent)', padding: '2px 8px', borderRadius: 99 }}>
                          {usageCounts[ing.id]} platillo{usageCounts[ing.id] !== 1 ? 's' : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setEditState({ id: ing.id, name: ing.name, unit: ing.unit, cost_per_unit: String(ing.cost_per_unit) })}
                          className="press"
                          style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)' }}
                          title="Editar"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ing)}
                          disabled={isPending}
                          className="press"
                          style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', border: '1px solid rgba(220,50,50,0.2)', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#f87171' }}
                          title="Eliminar"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </Glass>
      )}
    </div>
  );
}
