'use client';

import { useActionState, useState } from 'react';
import { Icon, ICON_PATHS } from '@/components/icons';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import DeleteButton from './delete-button';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryActive,
  moveCategoryUp,
  moveCategoryDown,
  type CatState,
} from '@/lib/actions/categories';
import {
  toggleProductAvailability,
  deleteProduct,
  moveProductUp,
  moveProductDown,
} from '@/lib/actions/products';
import type { Category, Product } from '@/types';

interface CategoryManagerProps {
  restaurantId: string;
  categories: Category[];
  products: Product[];
}

const emptyState: CatState = null;

export default function CategoryManager({
  restaurantId,
  categories,
  products,
}: CategoryManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const productsByCategory = (catId: string | null) =>
    products.filter((p) => p.category_id === catId);

  const uncategorized = productsByCategory(null);
  const allCats = [...categories];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Categorías */}
      {allCats.map((cat, idx) => (
        <CategoryCard
          key={cat.id}
          restaurantId={restaurantId}
          category={cat}
          products={productsByCategory(cat.id)}
          isFirst={idx === 0}
          isLast={idx === allCats.length - 1}
          isEditing={editingId === cat.id}
          onEdit={() => setEditingId(editingId === cat.id ? null : cat.id)}
        />
      ))}

      {/* Productos sin categoría */}
      {uncategorized.length > 0 && (
        <Glass variant="quiet" style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--u-text-3)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            Sin categoría
          </div>
          <ProductList
            products={uncategorized}
            restaurantId={restaurantId}
            categoryId={null}
          />
        </Glass>
      )}

      {/* Formulario nueva categoría */}
      {showNewForm ? (
        <NewCategoryForm
          restaurantId={restaurantId}
          onClose={() => setShowNewForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="press"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px dashed var(--u-hair-2)',
            color: 'var(--u-text-3)',
            padding: '12px',
            borderRadius: 'var(--radius-lg)',
            fontSize: 14,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          + Nueva categoría
        </button>
      )}
    </div>
  );
}

/* ── Tarjeta de categoría ─────────────────────────────────── */
function CategoryCard({
  restaurantId,
  category,
  products,
  isFirst,
  isLast,
  isEditing,
  onEdit,
}: {
  restaurantId: string;
  category: Category;
  products: Product[];
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  onEdit: () => void;
}) {
  return (
    <Glass variant="quiet" style={{ padding: 16, opacity: category.is_active ? 1 : 0.55 }}>
      {/* Cabecera de categoría */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: products.length > 0 || isEditing ? 12 : 0,
        }}
      >
        {/* Nombre / form edición inline */}
        {isEditing ? (
          <EditCategoryForm
            restaurantId={restaurantId}
            category={category}
            onClose={onEdit}
          />
        ) : (
          <>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>
              {category.icon && (
                ICON_PATHS[category.icon]
                  ? <><Icon name={category.icon} size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} /></>
                  : <span style={{ marginRight: 4 }}>{category.icon}</span>
              )}{category.name}
            </span>

            {/* Activo / inactivo */}
            <form action={toggleCategoryActive}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="is_active" value={String(!category.is_active)} />
              <button
                type="submit"
                className="press"
                title={category.is_active ? 'Desactivar' : 'Activar'}
                style={{
                  background: 'none',
                  border: '1px solid var(--u-hair-2)',
                  borderRadius: 'var(--radius-full)',
                  padding: '3px 10px',
                  fontSize: 11,
                  color: category.is_active ? 'var(--brand-accent)' : 'var(--u-text-4)',
                  cursor: 'pointer',
                }}
              >
                {category.is_active ? 'Activa' : 'Inactiva'}
              </button>
            </form>

            {/* Editar */}
            <button
              type="button"
              onClick={onEdit}
              aria-label="Editar categoría"
              className="press"
              style={{
                background: 'none',
                border: '1px solid var(--u-hair)',
                borderRadius: 'var(--radius-full)',
                padding: '5px 9px',
                display: 'grid', placeItems: 'center',
                color: 'var(--u-text-3)',
                cursor: 'pointer',
              }}
            >
              <Icon name="edit" size={13} />
            </button>

            {/* Reordenar */}
            {!isFirst && (
              <form action={moveCategoryUp} style={{ display: 'inline' }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="sort_order" value={String(category.sort_order)} />
                <button
                  type="submit"
                  className="press"
                  title="Subir"
                  style={reorderBtnStyle}
                >
                  ↑
                </button>
              </form>
            )}
            {!isLast && (
              <form action={moveCategoryDown} style={{ display: 'inline' }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="sort_order" value={String(category.sort_order)} />
                <button
                  type="submit"
                  className="press"
                  title="Bajar"
                  style={reorderBtnStyle}
                >
                  ↓
                </button>
              </form>
            )}

            {/* Eliminar (solo si no tiene productos) */}
            {products.length === 0 && (
              <DeleteButton
                action={deleteCategory}
                hiddenFields={{ restaurantId, id: category.id }}
                label="×"
                confirm={`¿Eliminar la categoría "${category.name}"?`}
              />
            )}
          </>
        )}
      </div>

      {/* Productos de la categoría */}
      {!isEditing && products.length > 0 && (
        <ProductList
          products={products}
          restaurantId={restaurantId}
          categoryId={category.id}
        />
      )}

      {/* Botón añadir producto a esta categoría */}
      {!isEditing && (
        <Link
          href={`/admin/menu/productos/new?cat=${category.id}`}
          className="press"
          style={{
            display: 'block',
            marginTop: products.length > 0 ? 10 : 0,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--u-text-3)',
            textDecoration: 'none',
            textAlign: 'center',
            border: '1px dashed var(--u-hair)',
          }}
        >
          + Producto
        </Link>
      )}
    </Glass>
  );
}

/* ── Lista de productos ───────────────────────────────────── */
function ProductList({
  products,
  restaurantId,
  categoryId,
}: {
  products: Product[];
  restaurantId: string;
  categoryId: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {products.map((p, idx) => (
        <ProductRow
          key={p.id}
          product={p}
          restaurantId={restaurantId}
          categoryId={categoryId}
          isFirst={idx === 0}
          isLast={idx === products.length - 1}
        />
      ))}
    </div>
  );
}

/* ── Fila de producto ─────────────────────────────────────── */
function ProductRow({
  product,
  restaurantId,
  categoryId,
  isFirst,
  isLast,
}: {
  product: Product;
  restaurantId: string;
  categoryId: string | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--u-hair)',
        opacity: product.is_available ? 1 : 0.55,
      }}
    >
      {/* Imagen miniatura */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          background: product.image_url
            ? `url(${product.image_url}) center/cover no-repeat`
            : 'var(--surface-3)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--u-text-3)',
        }}
      >
        {!product.image_url && <Icon name="utensils" size={18} />}
      </div>

      {/* Nombre + precio */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {product.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--brand-accent)', fontWeight: 600 }}>
          Q{product.price.toFixed(2)}
        </div>
      </div>

      {/* Toggle disponibilidad */}
      <form action={toggleProductAvailability}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="id" value={product.id} />
        <input
          type="hidden"
          name="is_available"
          value={String(!product.is_available)}
        />
        <button
          type="submit"
          title={product.is_available ? 'Disponible — clic para ocultar' : 'Oculto — clic para mostrar'}
          style={{
            width: 36,
            height: 22,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: product.is_available ? 'var(--brand-accent)' : 'var(--u-hair-2)',
            position: 'relative',
            transition: 'background 200ms',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: product.is_available ? 17 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 200ms',
            }}
          />
        </button>
      </form>

      {/* Editar */}
      <Link
        href={`/admin/menu/productos/${product.id}`}
        className="press"
        aria-label="Editar producto"
        style={{
          background: 'none',
          border: '1px solid var(--u-hair)',
          borderRadius: 'var(--radius-full)',
          padding: '6px 9px',
          display: 'grid', placeItems: 'center',
          color: 'var(--u-text-3)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name="edit" size={13} />
      </Link>

      {/* Reordenar */}
      {!isFirst && (
        <form action={moveProductUp}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="sort_order" value={String(product.sort_order)} />
          <input type="hidden" name="category_id" value={categoryId ?? ''} />
          <button type="submit" className="press" style={reorderBtnStyle} title="Subir">↑</button>
        </form>
      )}
      {!isLast && (
        <form action={moveProductDown}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="sort_order" value={String(product.sort_order)} />
          <input type="hidden" name="category_id" value={categoryId ?? ''} />
          <button type="submit" className="press" style={reorderBtnStyle} title="Bajar">↓</button>
        </form>
      )}

      {/* Eliminar */}
      <DeleteButton
        action={deleteProduct}
        hiddenFields={{ restaurantId, id: product.id }}
        label="×"
        confirm={`¿Eliminar "${product.name}"?`}
      />
    </div>
  );
}

/* ── Formulario nueva categoría ──────────────────────────── */
function NewCategoryForm({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createCategory, emptyState);

  return (
    <Glass variant="quiet" style={{ padding: 16 }}>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nueva categoría</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <CategoryIconPicker name="icon" />
          <input
            name="name"
            type="text"
            required
            placeholder="Nombre de la categoría"
            style={{ ...inlineInputStyle, flex: 1 }}
          />
        </div>

        {state?.error && (
          <span style={{ fontSize: 12, color: '#f87171' }}>{state.error}</span>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={isPending}
            className="press btn-accent"
            style={submitBtnSmall}
          >
            {isPending ? '…' : 'Crear'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="press"
            style={cancelBtnSmall}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Glass>
  );
}

/* ── Formulario edición inline de categoría ──────────────── */
function EditCategoryForm({
  restaurantId,
  category,
  onClose,
}: {
  restaurantId: string;
  category: Category;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateCategory, emptyState);

  return (
    <form action={formAction} style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="id" value={category.id} />
      <CategoryIconPicker name="icon" defaultValue={category.icon ?? ''} />
      <input
        name="name"
        type="text"
        required
        defaultValue={category.name}
        style={{ ...inlineInputStyle, flex: 1 }}
        autoFocus
      />
      <button
        type="submit"
        disabled={isPending}
        aria-label="Guardar"
        className="press btn-accent"
        style={{ ...submitBtnSmall, display: 'grid', placeItems: 'center' }}
      >
        {isPending ? '…' : <Icon name="check" size={15} strokeWidth={2.6} />}
      </button>
      <button type="button" onClick={onClose} aria-label="Cancelar" className="press" style={{ ...cancelBtnSmall, display: 'grid', placeItems: 'center' }}>
        <Icon name="x" size={15} />
      </button>
      {state?.error && (
        <span style={{ fontSize: 11, color: '#f87171' }}>{state.error}</span>
      )}
    </form>
  );
}

/* ── Selector de ícono de categoría (SVG, no emoji) ──────────
   Antes el ícono se escribía como emoji a mano y NO renderizaba en el menú
   (Icon ignora nombres que no existen). Ahora se elige de un set curado de
   íconos SVG; el valor guardado es el nombre del ícono (p. ej. "coffee"). */
const CATEGORY_ICONS = [
  'utensils', 'coffee', 'bagel', 'croissant', 'ice', 'cookie',
  'flame', 'leaf', 'milk', 'wheat', 'star', 'sparkle', 'bag', 'box', 'tag',
];

function CategoryIconPicker({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const initial = defaultValue && ICON_PATHS[defaultValue] ? defaultValue : 'utensils';
  const [icon, setIcon] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={icon} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Elegir ícono"
        className="press"
        style={{ ...inlineInputStyle, width: 46, height: 38, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--u-text)' }}
      >
        <Icon name={icon} size={18} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            className="glass-solid anim-pop"
            style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: 8, borderRadius: 14, width: 214 }}
          >
            {CATEGORY_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => { setIcon(ic); setOpen(false); }}
                aria-label={ic}
                className="press"
                style={{
                  width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${icon === ic ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
                  background: icon === ic ? 'color-mix(in srgb, var(--brand-accent) 20%, transparent)' : 'transparent',
                  color: 'var(--u-text)',
                }}
              >
                <Icon name={ic} size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Estilos utilitarios ─────────────────────────────────── */
const reorderBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--u-hair)',
  borderRadius: 6,
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  color: 'var(--u-text-3)',
  cursor: 'pointer',
  padding: 0,
};

const inlineInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  color: 'var(--u-text)',
  fontSize: 14,
  outline: 'none',
};

const submitBtnSmall: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-full)',
  fontWeight: 600,
  fontSize: 13,
  border: 'none',
  cursor: 'pointer',
};

const cancelBtnSmall: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--radius-full)',
  fontSize: 13,
  border: '1px solid var(--u-hair-2)',
  background: 'transparent',
  color: 'var(--u-text-3)',
  cursor: 'pointer',
};
