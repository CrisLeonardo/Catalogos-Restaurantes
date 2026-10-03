'use client';

/* CategoriesPanel — gestión de categorías estilo prototipo.
   Usada en /admin/categorias. */

import { useActionState, useEffect, useOptimistic, useRef, useState } from 'react';
import { Icon, ICON_PATHS } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CAT_ICON_MAP, suggestIcon } from '@/lib/category-icon';

/* Sin icono elegido, el que sugiere el nombre (Café → taza, Dulce →
   galleta) y no la misma mesa genérica en todas (auditoría 2026-10-02,
   MEN-08). */
function CatIconDisplay({ icon, name }: { icon: string | null; name: string }) {
  if (!icon) return <Icon name={suggestIcon(name)} size={22} />;
  if (ICON_PATHS[icon]) return <Icon name={icon} size={22} />;
  return <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>;
}

/* Set de íconos elegibles para una categoría (los mismos que sugiere el auto). */
const CAT_ICONS = CAT_ICON_MAP.map(([icon]) => icon);

/* Selector de ícono: botón con el ícono actual + popover con la rejilla.
   `value` = override manual (null = seguir la sugerencia automática del nombre). */
function CatIconPicker({ value, suggested, onChange }: {
  value: string | null; suggested: string; onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const effective = value && ICON_PATHS[value] ? value : suggested;
  const cell = (active: boolean): React.CSSProperties => ({
    width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-md)', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
    background: active ? 'color-mix(in srgb, var(--brand-accent) 20%, transparent)' : 'transparent',
    color: 'var(--u-text)',
  });
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Elegir ícono"
        className="press"
        style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair)', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer' }}
      >
        <Icon name={effective} size={22} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="glass-solid anim-pop" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: 8, borderRadius: 'var(--radius-lg)', width: 214 }}>
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="press"
              style={{ ...cell(value === null), gridColumn: 'span 5', width: 'auto', height: 32, display: 'flex', gap: 6, justifyContent: 'center', fontSize: 11.5, fontWeight: 600 }}>
              <Icon name="sparkle" size={13} /> Automático
            </button>
            {CAT_ICONS.map((ic) => (
              <button key={ic} type="button" onClick={() => { onChange(ic); setOpen(false); }} aria-label={ic} className="press" style={cell(value === ic)}>
                <Icon name={ic} size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
import {
  moveCategoryUp,
  moveCategoryDown,
  toggleCategoryActive,
  createCategoryModal,
  updateCategoryModal,
  deleteCategoryModal,
  type CatModalState,
} from '@/lib/actions/categories';
import CategorySchedule from '@/components/admin/category-schedule';
import type { Category, Product } from '@/types';

/* ── CategoriesPanel ──────────────────────────────────────── */

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
}

export default function CategoriesPanel({ restaurantId, categories, products }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew,   setShowNew]   = useState(false);
  const toggleForms = useRef<Record<string, HTMLFormElement | null>>({});

  const count = (id: string) => products.filter((p) => p.category_id === id).length;

  /* Subir/bajar al instante: antes cada flecha esperaba al servidor y a la
     recarga para mover la tarjeta, y con dos toques seguidos el segundo
     caía sobre el orden viejo. La tarjeta se mueve ya; el servidor confirma
     por detrás y, al volver, `categories` trae el orden de verdad (MEN-08). */
  const [lista, mover] = useOptimistic(categories, (state, { id, dir }: { id: string; dir: -1 | 1 }) => {
    const i = state.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.length) return state;
    const next = [...state];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  function onSaved() {
    setEditingId(null);
    setShowNew(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Sin el «CATEGORÍAS DEL MENÚ» en letra de cartel: la pestaña ya dice
            dónde se está, y ningún otro listado del panel lleva encabezado
            propio (auditoría 2026-10-02, T-10). */}
        <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', margin: 0 }}>
          Ordena cómo aparecen en tu menú con las flechas.
        </p>
        <Button onClick={() => setShowNew(true)} className="rounded-adm-full">
          <Icon name="plus" size={15} /> Nueva
        </Button>
      </div>

      {/* Lista */}
      {categories.length === 0 && !showNew && (
        <EmptyState
          icon="tag"
          title="Sin categorías aún"
          desc="Crea una para organizar tu menú — entradas, bebidas, postres…"
          action={{ label: 'Crear la primera', onClick: () => setShowNew(true) }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map((c, i) => (
          <Card
            key={c.id}
            className="flex items-center gap-3 p-4"
            style={{ opacity: c.is_active ? 1 : 0.6, transition: 'opacity 160ms' }}
          >
            {/* Reordenar ↑↓ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              {i > 0 ? (
                <form action={async (fd) => { mover({ id: c.id, dir: -1 }); await moveCategoryUp(fd); }}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="id"           value={c.id} />
                  <input type="hidden" name="sort_order"   value={String(c.sort_order)} />
                  <button type="submit" className="press tap44" style={reorderBtn} title="Subir">
                    <Icon name="arrowUp" size={12} />
                  </button>
                </form>
              ) : (
                <div style={{ width: 26, height: 26 }} />
              )}
              {i < lista.length - 1 ? (
                <form action={async (fd) => { mover({ id: c.id, dir: 1 }); await moveCategoryDown(fd); }}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="id"           value={c.id} />
                  <input type="hidden" name="sort_order"   value={String(c.sort_order)} />
                  <button type="submit" className="press tap44" style={reorderBtn} title="Bajar">
                    <Icon name="arrowDown" size={12} />
                  </button>
                </form>
              ) : (
                <div style={{ width: 26, height: 26 }} />
              )}
            </div>

            {/* Ícono */}
            <div
              style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair)',
                display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', flexShrink: 0,
              }}
            >
              <CatIconDisplay icon={c.icon} name={c.name} />
            </div>

            {/* Nombre + contador / formulario inline */}
            {editingId === c.id ? (
              <InlineEditForm
                restaurantId={restaurantId}
                category={c}
                onClose={() => setEditingId(null)}
                onSaved={onSaved}
              />
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600, fontSize: 15.5,
                    color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
                  {count(c.id)} platillo{count(c.id) !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            {/* Toggle activo */}
            {editingId !== c.id && (
              <form
                action={toggleCategoryActive}
                ref={(el) => { toggleForms.current[c.id] = el; }}
                style={{ flexShrink: 0 }}
              >
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id"           value={c.id} />
                <input type="hidden" name="is_active"    value={String(!c.is_active)} />
                <Switch
                  checked={c.is_active}
                  onCheckedChange={() => toggleForms.current[c.id]?.requestSubmit()}
                  aria-label={c.is_active ? 'Desactivar' : 'Activar'}
                />
              </form>
            )}

            {/* Editar */}
            {editingId !== c.id && (
              <Button
                variant="secondary"
                size="icon"
                className="size-8.5"
                onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                title="Editar"
              >
                <Icon name="edit" size={16} />
              </Button>
            )}

            {/* Eliminar (solo si no tiene platillos) */}
            {editingId !== c.id && count(c.id) === 0 && (
              <DeleteCatButton restaurantId={restaurantId} categoryId={c.id} name={c.name} />
            )}
          </Card>
        ))}
      </div>

      {/* Formulario nueva categoría */}
      {showNew && (
        <NewCategoryForm
          restaurantId={restaurantId}
          onClose={() => setShowNew(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

/* ── NewCategoryForm ──────────────────────────────────────── */

function NewCategoryForm({
  restaurantId,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, isPending] = useActionState<CatModalState, FormData>(
    createCategoryModal,
    null,
  );
  const [catName, setCatName] = useState('');
  const [iconOverride, setIconOverride] = useState<string | null>(null);
  const iconSuggested = suggestIcon(catName);
  const iconValue = iconOverride && ICON_PATHS[iconOverride] ? iconOverride : iconSuggested;

  useEffect(() => {
    if (state && 'success' in state) onSaved();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card data-tour-step="categorias-nueva" className="p-4.5">
      <div className="adm-label" style={{ marginBottom: 12 }}>Nueva categoría</div>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="icon" value={iconValue} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CatIconPicker value={iconOverride} suggested={iconSuggested} onChange={setIconOverride} />
          <input
            name="name"
            type="text"
            required
            placeholder="Nombre de la categoría"
            autoFocus
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            style={{ ...inlineInput, flex: 1 }}
          />
        </div>
        <input
          name="name_en"
          type="text"
          placeholder="Nombre en inglés (opcional)"
          style={inlineInput}
        />
        <CategorySchedule defaultValue={null} />
        {state && 'error' in state && (
          <span style={{ fontSize: 12, color: 'var(--c-danger)' }}>{state.error}</span>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" disabled={isPending} size="sm" className="rounded-adm-full">
            {isPending ? '…' : 'Crear'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} size="sm" className="rounded-adm-full">
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ── InlineEditForm ───────────────────────────────────────── */

function InlineEditForm({
  restaurantId,
  category,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  category: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, isPending] = useActionState<CatModalState, FormData>(
    updateCategoryModal,
    null,
  );
  const [catName, setCatName] = useState(category.name);
  const [iconOverride, setIconOverride] = useState<string | null>(
    category.icon && ICON_PATHS[category.icon] ? category.icon : null,
  );
  const iconSuggested = suggestIcon(catName);
  const iconValue = iconOverride && ICON_PATHS[iconOverride] ? iconOverride : iconSuggested;

  useEffect(() => {
    if (state && 'success' in state) onSaved();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="id"           value={category.id} />
      <input type="hidden" name="icon"         value={iconValue} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <CatIconPicker value={iconOverride} suggested={iconSuggested} onChange={setIconOverride} />
        <input
          name="name"
          type="text"
          required
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          autoFocus
          style={{ ...inlineInput, flex: 1, minWidth: 0 }}
        />
        <Button type="submit" disabled={isPending} aria-label="Guardar" size="icon" className="size-8.5 shrink-0 rounded-adm-full">
          {isPending ? '…' : <Icon name="check" size={15} strokeWidth={2.6} />}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} aria-label="Cancelar" size="icon" className="size-8.5 shrink-0 rounded-adm-full">
          <Icon name="x" size={15} />
        </Button>
      </div>
      <input
        name="name_en"
        type="text"
        defaultValue={category.name_en ?? ''}
        placeholder="Nombre en inglés (opcional)"
        style={inlineInput}
      />
      <CategorySchedule defaultValue={category.availability} />
      {state && 'error' in state && (
        <span style={{ fontSize: 11, color: 'var(--c-danger)' }}>{state.error}</span>
      )}
    </form>
  );
}

/* ── DeleteCatButton ──────────────────────────────────────── */

function DeleteCatButton({
  restaurantId,
  categoryId,
  name,
}: {
  restaurantId: string;
  categoryId: string;
  name: string;
}) {
  const { confirmSubmit, dialog } = useConfirm();

  return (
    <>
    {dialog}
    <form
      action={deleteCategoryModal}
      // Este botón solo sale en categorías sin platillos, así que no hay
      // nada más que advertir que el borrado mismo.
      onSubmit={confirmSubmit({ title: `¿Eliminar la categoría «${name}»?` })}
      style={{ flexShrink: 0 }}
    >
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="id"           value={categoryId} />
      <Button
        type="submit"
        variant="outline"
        size="icon"
        className="size-8.5 text-[var(--u-text-4)]"
        title="Eliminar categoría"
        aria-label={`Eliminar la categoría ${name}`}
      >
        <Icon name="trash" size={14} />
      </Button>
    </form>
    </>
  );
}

/* ── Estilos utilitarios ──────────────────────────────────── */

const reorderBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--u-hair)',
  background: 'transparent', color: 'var(--u-text-4)',
  cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
};

const inlineInput: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 12px',
  color: 'var(--u-text)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

