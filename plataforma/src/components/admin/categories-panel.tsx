'use client';

/* CategoriesPanel — gestión de categorías estilo prototipo.
   Usada en /admin/categorias. */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, ICON_PATHS } from '@/components/icons';

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const CAT_ICON_MAP: [string, string[]][] = [
  ['coffee',    ['cafe', 'coffee', 'te', 'latte', 'capuchino', 'espreso', 'expreso', 'boba', 'jugo', 'refresco', 'cocoa', 'matcha']],
  ['sparkle',   ['cocktail', 'coctel', 'bar', 'alcohol', 'cerveza', 'beer', 'vino', 'wine', 'copa', 'bebida alcoholica', 'cantina']],
  ['ice',       ['frappe', 'smoothie', 'batido', 'licuado', 'malteada', 'shake', 'frio', 'agua fresca']],
  ['flame',     ['parrilla', 'grill', 'brasa', 'bbq', 'barbecue', 'carne', 'asado', 'parrillada', 'alitas', 'wings']],
  ['leaf',      ['vegano', 'vegetal', 'ensalada', 'salad', 'saludable', 'verde', 'organico', 'natural', 'verduras', 'fruta', 'fruit', 'vegetariano']],
  ['cookie',    ['postre', 'dessert', 'pastel', 'torta', 'dulce', 'sweet', 'galleta', 'helado', 'gelatina', 'flan', 'brownie', 'crepa', 'waffle', 'pan dulce']],
  ['croissant', ['sandwich', 'sanwich', 'hamburguesa', 'burger', 'torta', 'wrap', 'hot dog', 'hotdog', 'baguette', 'pan', 'bread', 'tostada', 'quesadilla', 'burritos']],
  ['milk',      ['lacteo', 'queso', 'leche', 'dairy', 'yogurt', 'yogur', 'cremoso']],
  ['wheat',     ['pasta', 'arroz', 'rice', 'cereal', 'harina', 'espagueti', 'fideos', 'noodles']],
  ['star',      ['especial', 'special', 'premium', 'signature', 'chef', 'popular', 'favorito', 'destacado', 'promocion', 'oferta', 'combo']],
  ['bagel',     ['pizza', 'donut', 'dona', 'bagel', 'empanada', 'gordita', 'arepa']],
  ['utensils',  []],
];

function suggestIcon(name: string): string {
  const n = fold(name);
  for (const [icon, kws] of CAT_ICON_MAP) {
    for (const kw of kws) {
      if (n.includes(fold(kw))) return icon;
    }
  }
  return 'utensils';
}

function CatIconDisplay({ icon }: { icon: string | null }) {
  if (!icon) return <Icon name="utensils" size={22} />;
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
    width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, cursor: 'pointer',
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
        style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--u-hair)', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer' }}
      >
        <Icon name={effective} size={22} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="glass-solid anim-pop" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: 8, borderRadius: 14, width: 214 }}>
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
  const router = useRouter();

  const count = (id: string) => products.filter((p) => p.category_id === id).length;

  function onSaved() {
    setEditingId(null);
    setShowNew(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="t-poster" style={{ fontSize: 20 }}>Categorías del menú</h1>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3, margin: '3px 0 0' }}>
            Ordená cómo aparecen en la app del cliente.
          </p>
        </div>
        <button
          className="press"
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 99, cursor: 'pointer',
            background: 'var(--u-text)', color: 'var(--brand-bg)',
            border: 'none', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          }}
        >
          <Icon name="plus" size={15} /> Nueva
        </button>
      </div>

      {/* Lista */}
      {categories.length === 0 && !showNew && (
        <div
          className="glass"
          style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}
        >
          Sin categorías aún. Crea una para organizar tu menú.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map((c, i) => (
          <div
            key={c.id}
            className="glass"
            style={{
              borderRadius: 15, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: c.is_active ? 1 : 0.6, transition: 'opacity 160ms',
            }}
          >
            {/* Reordenar ↑↓ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              {i > 0 ? (
                <form action={moveCategoryUp}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="id"           value={c.id} />
                  <input type="hidden" name="sort_order"   value={String(c.sort_order)} />
                  <button type="submit" className="press" style={reorderBtn} title="Subir">
                    <Icon name="arrowUp" size={12} />
                  </button>
                </form>
              ) : (
                <div style={{ width: 26, height: 26 }} />
              )}
              {i < categories.length - 1 ? (
                <form action={moveCategoryDown}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="id"           value={c.id} />
                  <input type="hidden" name="sort_order"   value={String(c.sort_order)} />
                  <button type="submit" className="press" style={reorderBtn} title="Bajar">
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
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--u-hair)',
                display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', flexShrink: 0,
              }}
            >
              <CatIconDisplay icon={c.icon} />
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
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
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
              <form action={toggleCategoryActive} style={{ flexShrink: 0 }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id"           value={c.id} />
                <input type="hidden" name="is_active"    value={String(!c.is_active)} />
                <button
                  type="submit"
                  className="press"
                  title={c.is_active ? 'Desactivar' : 'Activar'}
                  style={{
                    width: 42, height: 25, borderRadius: 99, border: 'none',
                    cursor: 'pointer', padding: 3,
                    background: c.is_active ? 'var(--u-text)' : 'rgba(255,255,255,0.12)',
                    display: 'flex', justifyContent: c.is_active ? 'flex-end' : 'flex-start',
                    transition: 'background 180ms',
                  }}
                >
                  <span
                    style={{
                      width: 19, height: 19, borderRadius: 99,
                      background: c.is_active ? 'var(--brand-bg)' : 'rgba(255,255,255,0.9)',
                    }}
                  />
                </button>
              </form>
            )}

            {/* Editar */}
            {editingId !== c.id && (
              <button
                className="press glass-quiet"
                onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                style={{
                  width: 34, height: 34, borderRadius: 10, border: 'none',
                  display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Editar"
              >
                <Icon name="edit" size={16} />
              </button>
            )}

            {/* Eliminar (solo si no tiene platillos) */}
            {editingId !== c.id && count(c.id) === 0 && (
              <DeleteCatButton restaurantId={restaurantId} categoryId={c.id} name={c.name} />
            )}
          </div>
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
    <div className="glass" style={{ borderRadius: 15, padding: '16px 18px' }}>
      <div className="t-kicker" style={{ fontSize: 10, marginBottom: 12 }}>Nueva categoría</div>
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
        {state && 'error' in state && (
          <span style={{ fontSize: 12, color: '#f87171' }}>{state.error}</span>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={isPending} className="press" style={submitBtn}>
            {isPending ? '…' : 'Crear'}
          </button>
          <button type="button" onClick={onClose} className="press" style={cancelBtn}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
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
    <form action={formAction} style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="id"           value={category.id} />
      <input type="hidden" name="icon"         value={iconValue} />
      <CatIconPicker value={iconOverride} suggested={iconSuggested} onChange={setIconOverride} />
      <input
        name="name"
        type="text"
        required
        value={catName}
        onChange={(e) => setCatName(e.target.value)}
        autoFocus
        style={{ ...inlineInput, flex: 1 }}
      />
      {state && 'error' in state && (
        <span style={{ fontSize: 11, color: '#f87171', flexShrink: 0 }}>{state.error}</span>
      )}
      <button type="submit" disabled={isPending} className="press" style={{ ...submitBtn, flexShrink: 0 }}>
        {isPending ? '…' : '✓'}
      </button>
      <button type="button" onClick={onClose} className="press" style={{ ...cancelBtn, flexShrink: 0 }}>
        ×
      </button>
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
  const ref = useRef<HTMLFormElement>(null);

  function handleClick(e: React.MouseEvent) {
    if (!window.confirm(`¿Eliminar la categoría "${name}"?`)) {
      e.preventDefault();
    }
  }

  return (
    <form ref={ref} action={deleteCategoryModal} style={{ flexShrink: 0 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="id"           value={categoryId} />
      <button
        type="submit"
        className="press"
        onClick={handleClick}
        title="Eliminar categoría"
        style={{
          width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)',
          display: 'grid', placeItems: 'center', background: 'transparent',
          color: 'var(--u-text-4)', cursor: 'pointer', fontSize: 16,
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </form>
  );
}

/* ── Estilos utilitarios ──────────────────────────────────── */

const reorderBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 8,
  border: '1px solid var(--u-hair)',
  background: 'transparent', color: 'var(--u-text-4)',
  cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
};

const inlineInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 10,
  padding: '9px 12px',
  color: 'var(--u-text)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

const submitBtn: React.CSSProperties = {
  padding: '9px 18px',
  borderRadius: 99,
  fontWeight: 600, fontSize: 13,
  border: 'none', cursor: 'pointer',
  background: 'var(--u-text)', color: 'var(--brand-bg)',
};

const cancelBtn: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: 99,
  fontSize: 13,
  border: '1px solid var(--u-hair-2)',
  background: 'transparent',
  color: 'var(--u-text-3)',
  cursor: 'pointer',
};
