'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import ImageUpload from './image-upload';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import { createProduct, updateProduct, type ProductState } from '@/lib/actions/products';
import type { Category, Product, ProductOptionGroup } from '@/types';

interface ProductFormProps {
  restaurantId: string;
  categories: Category[];
  product?: Product;
  defaultCategoryId?: string;
}

const emptyState: ProductState = null;

export default function ProductForm({ restaurantId, categories, product, defaultCategoryId }: ProductFormProps) {
  const isEdit = Boolean(product);
  const action = isEdit ? updateProduct : createProduct;

  const [state, formAction, isPending] = useActionState(action, emptyState);
  const [imageUrl, setImageUrl] = useState<string>(product?.image_url ?? '');
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [options, setOptions] = useState<ProductOptionGroup[]>(
    Array.isArray(product?.options) ? product!.options! : [],
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--u-hair-2)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    color: 'var(--u-text)',
    fontSize: 15,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--u-text-3)',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Campos ocultos */}
      <input type="hidden" name="restaurantId" value={restaurantId} />
      {isEdit && <input type="hidden" name="id" value={product!.id} />}
      <input type="hidden" name="image_url" value={imageUrl} />
      <input type="hidden" name="is_available" value={String(isAvailable)} />
      <input type="hidden" name="options" value={JSON.stringify(cleanOptions(options))} />

      {/* Foto */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label style={labelStyle}>Foto del platillo</label>
        <ImageUpload
          restaurantId={restaurantId}
          currentUrl={product?.image_url}
          folder="products"
          onUpload={setImageUrl}
        />
      </Glass>

      {/* Nombre */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="name" style={labelStyle}>Nombre *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={product?.name ?? ''}
          placeholder="Ej: Mocha Negra"
          style={inputStyle}
        />
      </Glass>

      {/* Precio */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="price" style={labelStyle}>Precio *</label>
        <input
          id="price"
          name="price"
          type="number"
          required
          min="0"
          step="0.01"
          defaultValue={product?.price ?? ''}
          placeholder="0.00"
          style={inputStyle}
        />
      </Glass>

      {/* Categoría */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="category_id" style={labelStyle}>Categoría</label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={product?.category_id ?? defaultCategoryId ?? ''}
          style={inputStyle}
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Glass>

      {/* Descripción */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="description" style={labelStyle}>Descripción</label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={product?.description ?? ''}
          placeholder="Describe el platillo…"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </Glass>

      {/* Tags */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="tags" style={labelStyle}>Etiquetas</label>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={product?.tags?.join(', ') ?? ''}
          placeholder="Picante, Favorito, Nuevo"
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4, display: 'block' }}>
          Separadas por coma
        </span>
      </Glass>

      {/* Variantes / extras */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label style={labelStyle}>Variantes y extras</label>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '0 0 10px' }}>
          Tamaños, extras con precio… el cliente los elige al pedir.
        </p>
        <OptionsEditor value={options} onChange={setOptions} />
      </Glass>

      {/* Disponibilidad */}
      <Glass variant="quiet" style={{ padding: '14px 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Disponible</div>
            <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
              {isAvailable ? 'Visible en el menú' : 'Oculto en el menú'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAvailable(!isAvailable)}
            style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: isAvailable ? 'var(--brand-accent)' : 'var(--u-hair-2)',
              position: 'relative',
              transition: 'background 200ms',
              flexShrink: 0,
            }}
            aria-label="Disponibilidad"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: isAvailable ? 21 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 200ms',
              }}
            />
          </button>
        </div>
      </Glass>

      {/* Error */}
      {state?.error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(220,50,50,0.12)',
            border: '1px solid rgba(220,50,50,0.25)',
            color: '#f87171',
            fontSize: 14,
          }}
        >
          {state.error}
        </div>
      )}

      {/* Botón guardar */}
      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 'var(--radius-full)',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
      </button>
    </form>
  );
}
