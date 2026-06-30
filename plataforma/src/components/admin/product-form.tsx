'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import ImageUpload from './image-upload';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import RecipeEditor from '@/components/admin/recipe-editor';
import { createProduct, updateProduct, type ProductState } from '@/lib/actions/products';
import type { Category, Product, ProductOptionGroup } from '@/types';
import type { Ingredient, RecipeItem } from '@/lib/db/recipes';

interface ProductFormProps {
  restaurantId: string;
  categories: Category[];
  product?: Product;
  defaultCategoryId?: string;
  ingredients?: Ingredient[];
  initialRecipe?: RecipeItem[];
}

const emptyState: ProductState = null;

export default function ProductForm({ restaurantId, categories, product, defaultCategoryId, ingredients, initialRecipe }: ProductFormProps) {
  const isEdit = Boolean(product);
  const action = isEdit ? updateProduct : createProduct;

  const [state, formAction, isPending] = useActionState(action, emptyState);
  const [imageUrl, setImageUrl] = useState<string>(product?.image_url ?? '');
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [priceVal, setPriceVal] = useState<string>(product?.price != null ? String(product.price) : '');
  const [costVal, setCostVal] = useState<string>(product?.cost != null ? String(product.cost) : '');
  const [loyaltyPtsVal, setLoyaltyPtsVal] = useState<string>(product?.loyalty_points != null ? String(product.loyalty_points) : '');
  // Si hay receta → costo auto; null = usar manual
  const [recipeCost, setRecipeCost] = useState<number | null>(
    initialRecipe && initialRecipe.length > 0
      ? initialRecipe.reduce((acc, l) => acc + l.line_cost, 0)
      : null,
  );
  const hasRecipe = recipeCost !== null;
  const displayCost = hasRecipe ? recipeCost.toFixed(2) : costVal;
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

      {/* Precio y costo → margen en vivo */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label htmlFor="price" style={labelStyle}>Precio *</label>
            <input
              id="price"
              name="price"
              type="number"
              required
              min="0"
              step="0.01"
              value={priceVal}
              onChange={(e) => setPriceVal(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="cost" style={labelStyle}>
              Costo{hasRecipe && <span style={{ color: 'var(--brand-accent)', marginLeft: 6, fontSize: 10, fontWeight: 400 }}>desde receta</span>}
            </label>
            <input
              id="cost"
              name="cost"
              type="number"
              min="0"
              step="0.0001"
              value={hasRecipe ? displayCost : costVal}
              onChange={hasRecipe ? undefined : (e) => setCostVal(e.target.value)}
              readOnly={hasRecipe}
              placeholder="0.00"
              style={{ ...inputStyle, opacity: hasRecipe ? 0.65 : 1, cursor: hasRecipe ? 'not-allowed' : 'text' }}
              title={hasRecipe ? 'Calculado automáticamente desde la receta' : undefined}
            />
          </div>
        </div>
        {(() => {
          const p = parseFloat(priceVal);
          const c = hasRecipe ? recipeCost : parseFloat(costVal);
          if (isNaN(p) || isNaN(c) || (!hasRecipe && costVal.trim() === '')) {
            return (
              <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 8, display: 'block' }}>
                Captura el costo para ver tu utilidad y margen por venta.
              </span>
            );
          }
          const profit = p - c;
          const margin = p > 0 ? (profit / p) * 100 : 0;
          const good = profit >= 0;
          return (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12.5 }}>
              <span style={{ color: 'var(--u-text-3)' }}>
                Utilidad:{' '}
                <strong style={{ color: good ? 'var(--u-text)' : '#f87171' }}>
                  {profit.toFixed(2)}
                </strong>
              </span>
              <span style={{ color: 'var(--u-text-3)' }}>
                Margen:{' '}
                <strong style={{ color: good ? 'var(--brand-accent)' : '#f87171' }}>
                  {margin.toFixed(0)}%
                </strong>
              </span>
            </div>
          );
        })()}
        {/* Puntos de lealtad por unidad (módulo Lealtad). Vacío = regla general. */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--u-hair)' }}>
          <label htmlFor="loyalty_points" style={labelStyle}>
            Puntos de lealtad <span style={{ color: 'var(--u-text-4)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(por unidad)</span>
          </label>
          <input
            id="loyalty_points"
            name="loyalty_points"
            type="number"
            min="0"
            step="1"
            value={loyaltyPtsVal}
            onChange={(e) => setLoyaltyPtsVal(e.target.value)}
            placeholder="Vacío = regla general"
            style={{ ...inputStyle, maxWidth: 220 }}
          />
          <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 6, display: 'block' }}>
            Puntos que gana el cliente por cada unidad comprada. Vacío = usar la regla general del programa; 0 = no otorga puntos.
          </span>
        </div>
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

      {/* Receta: nota cuando es producto nuevo pero ya hay insumos */}
      {!product && ingredients !== undefined && (
        <Glass variant="quiet" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📋</span>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            Después de guardar el platillo podrás asignarle su <strong style={{ color: 'var(--u-text-2)' }}>receta</strong> e ingredientes para calcular el food cost automáticamente.
          </p>
        </Glass>
      )}

      {/* Receta / costeo por ingrediente (solo en edición) */}
      {product && ingredients && (
        <Glass variant="quiet" style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Receta</p>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 3 }}>
              Define los ingredientes y cantidades. El costo del platillo se calcula automáticamente.
            </p>
          </div>
          <RecipeEditor
            productId={product.id}
            restaurantId={restaurantId}
            ingredients={ingredients}
            initialRecipe={initialRecipe ?? []}
            onCostChange={(c) => setRecipeCost(c)}
          />
        </Glass>
      )}
      {product && !ingredients && (
        <Glass variant="quiet" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0 }}>
            Activa el módulo <strong style={{ color: 'var(--u-text-2)' }}>Recetas e ingredientes</strong> desde tu{' '}
            <a href="/admin/modulos" style={{ color: 'var(--brand-accent)', textDecoration: 'none', fontWeight: 600 }}>
              panel de Módulos
            </a>{' '}
            para gestionar el food cost de tus platillos.
          </p>
        </Glass>
      )}

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
