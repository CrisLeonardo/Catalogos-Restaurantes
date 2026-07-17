'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { saveIngredient, deleteIngredient } from '@/lib/actions/recipes';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
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

const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>
            Define los insumos y su costo por unidad. Asígnalos a platillos para calcular el food cost automáticamente.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => { setShowAdd(true); setEditState(null); }}
          className="shrink-0 whitespace-nowrap rounded-adm-full"
        >
          + Nuevo insumo
        </Button>
      </div>


      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: 'var(--c-danger, #f87171)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Formulario nuevo */}
      {showAdd && (
        <Card className="p-4">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Nuevo insumo</p>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            {/* .ing-form-grid: 3 columnas en escritorio, apilado en móvil (antes
                columnas fijas de 140px que aplastaban el nombre en pantallas chicas). */}
            <div className="ing-form-grid">
              <div className="ing-form-name">
                <label style={labelStyle}>Nombre</label>
                <input style={inputStyle} required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Tomate roma" />
              </div>
              <div>
                <label style={labelStyle}>Unidad</label>
                <Select options={UNIT_OPTIONS} value={newUnit} onValueChange={setNewUnit} />
              </div>
              <div>
                <label style={labelStyle}>Costo / unidad</label>
                <input style={inputStyle} type="number" inputMode="decimal" min="0" step="0.0001" required value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="0.0000" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" disabled={isPending} className="rounded-adm-full">
                {isPending ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button type="button" variant="outline" onClick={resetAdd} className="rounded-adm-full">
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tabla de ingredientes */}
      {initialIngredients.length === 0 && !showAdd ? (
        <Card className="p-8 text-center">
          <Icon name="flask" size={32} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
          <p style={{ color: 'var(--u-text-3)', fontSize: 14 }}>Aún no tienes insumos registrados.</p>
          <p style={{ color: 'var(--u-text-4)', fontSize: 12, marginTop: 4 }}>Crea tu primer insumo para poder asignarlo a las recetas de tus platillos.</p>
        </Card>
      ) : (
        /* Lista responsiva (patrón catalog/customers): grid de columnas en
           escritorio; en móvil cada fila es una tarjeta de 2 líneas (antes era
           un <table> de 5 columnas que se desbordaba y era inusable). */
        <Card className="px-3.5 py-1" style={{ fontSize: 13 }}>
          <div className="ing-head" style={{ padding: '10px 0', borderBottom: '1px solid var(--u-hair)' }}>
            {['Insumo', 'Unidad', 'Costo / unidad', 'Platillos', ''].map((h) => (
              <div key={h} style={{ color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</div>
            ))}
          </div>
          {initialIngredients.map((ing, i) => {
            const usage = usageCounts[ing.id] ?? 0;
            const usageChip = usage > 0 ? (
              <span style={{ fontSize: 12, background: 'color-mix(in srgb, var(--u-text) 7%, transparent)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                {usage} platillo{usage !== 1 ? 's' : ''}
              </span>
            ) : null;
            const borderBottom = i < initialIngredients.length - 1 ? '1px solid var(--u-hair)' : 'none';

            if (editState?.id === ing.id) {
              return (
                <div key={ing.id} style={{ padding: '14px 0', borderBottom, background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', margin: '0 -14px', paddingLeft: 14, paddingRight: 14 }}>
                  <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ing-form-grid">
                      <div className="ing-form-name">
                        <label style={labelStyle}>Nombre</label>
                        <input style={inputStyle} required value={editState.name} onChange={(e) => setEditState({ ...editState, name: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Unidad</label>
                        <Select options={UNIT_OPTIONS} value={editState.unit} onValueChange={(v) => setEditState({ ...editState, unit: v })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Costo / unidad</label>
                        <input style={inputStyle} type="number" inputMode="decimal" min="0" step="0.0001" required value={editState.cost_per_unit} onChange={(e) => setEditState({ ...editState, cost_per_unit: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="submit" disabled={isPending} className="rounded-adm-full">
                        {isPending ? '…' : 'Guardar'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditState(null)} className="rounded-adm-full">
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              );
            }

            return (
              <div key={ing.id} className="ing-row" style={{ padding: '12px 0', borderBottom }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                  {/* Línea meta — solo visible en móvil (las columnas se ocultan) */}
                  <div className="ing-meta-mobile" style={{ color: 'var(--u-text-3)', fontSize: 12 }}>
                    <span>{ing.unit}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--u-text-2)' }}>Q {Number(ing.cost_per_unit).toFixed(4)}</span>
                    {usageChip}
                  </div>
                </div>
                <div className="ing-col-desk" style={{ color: 'var(--u-text-3)' }}>{ing.unit}</div>
                <div className="ing-col-desk" style={{ fontFamily: 'monospace' }}>Q {Number(ing.cost_per_unit).toFixed(4)}</div>
                <div className="ing-col-desk" style={{ color: 'var(--u-text-3)' }}>{usageChip ?? '—'}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignSelf: 'start' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9.5"
                    onClick={() => setEditState({ id: ing.id, name: ing.name, unit: ing.unit, cost_per_unit: String(ing.cost_per_unit) })}
                    title="Editar"
                    aria-label={`Editar ${ing.name}`}
                  >
                    <Icon name="edit" size={15} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9.5 border-[rgba(220,50,50,0.2)] text-[#f87171]"
                    onClick={() => handleDelete(ing)}
                    disabled={isPending}
                    title="Eliminar"
                    aria-label={`Eliminar ${ing.name}`}
                  >
                    <Icon name="trash" size={15} />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
