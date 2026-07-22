'use client';

/* ============================================================
   FORMULARIO DE PLATILLO (crear / editar)
   ------------------------------------------------------------
   Reorganizado en secciones con propósito claro (antes era una
   pila de 9 tarjetas sueltas — confuso en móvil y desperdiciado
   en PC):
     · Columna principal: Lo básico → Precio y ganancia →
       Opciones y combos → Receta.
     · Columna lateral (PC) / arriba (móvil): Foto + Disponible.
     · Barra de guardar fija abajo: siempre a un toque, sin
       perseguir el botón al final de un formulario largo.
   ============================================================ */

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import ImageUpload from './image-upload';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import RecipeEditor from '@/components/admin/recipe-editor';
import { createProduct, updateProduct, type ProductState } from '@/lib/actions/products';
import { DIETARY_TAG_OPTIONS } from '@/lib/dietary-tags';
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

/** Encabezado de sección: título + explicación corta de para qué sirve. */
function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

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
  const [dietaryTags, setDietaryTags] = useState<string[]>(product?.dietary_tags ?? []);
  function toggleDietaryTag(key: string) {
    setDietaryTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
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
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Campos ocultos */}
      <input type="hidden" name="restaurantId" value={restaurantId} />
      {isEdit && <input type="hidden" name="id" value={product!.id} />}
      <input type="hidden" name="image_url" value={imageUrl} />
      <input type="hidden" name="is_available" value={String(isAvailable)} />
      <input type="hidden" name="options" value={JSON.stringify(cleanOptions(options))} />
      <input type="hidden" name="dietary_tags" value={dietaryTags.join(',')} />

      <div className="pform-grid">
        {/* ══ Columna principal ══ */}
        <div className="pform-col">
          {/* ── Lo básico ── */}
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead title="Lo básico" hint="Nombre, precio y dónde aparece en tu menú." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(110px, 1fr)', gap: 12 }}>
                <div>
                  <label htmlFor="name" style={labelStyle}>Nombre *</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    defaultValue={product?.name ?? ''}
                    placeholder="Ej: Café Latte"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="price" style={labelStyle}>Precio *</label>
                  <input
                    id="price"
                    name="price"
                    type="number" inputMode="decimal"
                    required
                    min="0"
                    step="0.01"
                    value={priceVal}
                    onChange={(e) => setPriceVal(e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
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
              </div>
              <div>
                <label htmlFor="description" style={labelStyle}>Descripción</label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={product?.description ?? ''}
                  placeholder="Describe el platillo: ingredientes, tamaño, qué lo hace especial…"
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor="name_en" style={labelStyle}>Nombre (inglés)</label>
                  <input
                    id="name_en"
                    name="name_en"
                    type="text"
                    defaultValue={product?.name_en ?? ''}
                    placeholder="Opcional"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="description_en" style={labelStyle}>Descripción (inglés)</label>
                  <input
                    id="description_en"
                    name="description_en"
                    type="text"
                    defaultValue={product?.description_en ?? ''}
                    placeholder="Opcional"
                    style={inputStyle}
                  />
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: -6, display: 'block' }}>
                Se muestran solo si activas el selector de idioma en Ajustes → Idiomas del menú. Sin traducción, el comensal ve el español.
              </span>
              <div>
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
                  Separadas por coma — aparecen como sellos sobre la foto del platillo.
                </span>
              </div>
            </div>
          </Glass>

          {/* ── Alérgenos y dietas ── */}
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead
              title="Alérgenos y dietas"
              hint="Se muestran con ícono en el menú del comensal — a diferencia de las etiquetas, no se pueden ocultar (es información de seguridad alimentaria)."
            />
            {(['diet', 'allergen'] as const).map((kind) => (
              <div key={kind} style={{ marginBottom: kind === 'diet' ? 14 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {kind === 'diet' ? 'Apto para' : 'Contiene'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DIETARY_TAG_OPTIONS.filter((o) => o.kind === kind).map((o) => {
                    const active = dietaryTags.includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => toggleDietaryTag(o.key)}
                        className="press"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${active ? 'var(--brand-accent)' : 'var(--u-hair-2)'}`,
                          background: active ? 'color-mix(in srgb, var(--brand-accent) 16%, transparent)' : 'transparent',
                          color: 'var(--u-text)', fontSize: 12.5, fontWeight: 500,
                        }}
                      >
                        <span aria-hidden>{o.icon}</span> {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Glass>

          {/* ── Costo y ganancia ── */}
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead title="Costo y ganancia" hint="Opcional: captura tu costo para ver cuánto ganas por venta." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="cost" style={labelStyle}>
                  Costo{hasRecipe && <span style={{ color: 'var(--brand-accent)', marginLeft: 6, fontSize: 10, fontWeight: 400 }}>desde receta</span>}
                </label>
                <input
                  id="cost"
                  name="cost"
                  type="number" inputMode="decimal"
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
              <div>
                <label htmlFor="loyalty_points" style={labelStyle}>Puntos de lealtad</label>
                <input
                  id="loyalty_points"
                  name="loyalty_points"
                  type="number" inputMode="decimal"
                  min="0"
                  step="1"
                  value={loyaltyPtsVal}
                  onChange={(e) => setLoyaltyPtsVal(e.target.value)}
                  placeholder="Regla general"
                  style={inputStyle}
                />
              </div>
            </div>
            {(() => {
              const p = parseFloat(priceVal);
              const c = hasRecipe ? recipeCost : parseFloat(costVal);
              if (isNaN(p) || isNaN(c) || (!hasRecipe && costVal.trim() === '')) {
                return (
                  <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 10, display: 'block' }}>
                    Con el costo capturado verás aquí tu utilidad y margen por venta. Los puntos de lealtad
                    vacíos usan la regla general del programa; 0 = este platillo no otorga puntos.
                  </span>
                );
              }
              const profit = p - c;
              const margin = p > 0 ? (profit / p) * 100 : 0;
              const good = profit >= 0;
              return (
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--u-text-3)' }}>
                    Utilidad:{' '}
                    <strong style={{ color: good ? 'var(--u-text)' : 'var(--c-danger, #f87171)' }}>
                      {profit.toFixed(2)}
                    </strong>
                  </span>
                  <span style={{ color: 'var(--u-text-3)' }}>
                    Margen:{' '}
                    <strong style={{ color: good ? 'var(--brand-accent)' : 'var(--c-danger, #f87171)' }}>
                      {margin.toFixed(0)}%
                    </strong>
                  </span>
                </div>
              );
            })()}
          </Glass>

          {/* ── Opciones y combos ── */}
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead
              title="Opciones y combos"
              hint="Lo que el cliente elige al pedir: tamaños, extras con precio, o los componentes de un combo (con sus variantes, ej. sabor de bebida)."
            />
            <OptionsEditor value={options} onChange={setOptions} />
          </Glass>

          {/* ── Receta / costeo por ingrediente (solo en edición) ── */}
          {product && ingredients && (
            <Glass variant="quiet" style={{ padding: 18 }}>
              <SectionHead
                title="Receta"
                hint="Define ingredientes y cantidades — el costo del platillo se calcula solo y descuenta inventario."
              />
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
          {!product && ingredients !== undefined && (
            <Glass variant="quiet" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>📋</span>
              <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
                Después de guardar el platillo podrás asignarle su <strong style={{ color: 'var(--u-text-2)' }}>receta</strong> e ingredientes para calcular el food cost automáticamente.
              </p>
            </Glass>
          )}
        </div>

        {/* ══ Columna lateral: foto + disponibilidad ══ */}
        <div className="pform-col pform-side">
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead title="Foto del platillo" hint="Una buena foto vende más — se muestra en el menú y al abrir el platillo." />
            <ImageUpload
              restaurantId={restaurantId}
              currentUrl={product?.image_url}
              folder="products"
              onUpload={setImageUrl}
            />
          </Glass>

          <Glass variant="quiet" style={{ padding: '14px 18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Disponible</div>
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
        </div>
      </div>

      {/* ── Barra de guardar fija: el botón nunca queda fuera de alcance ── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          margin: '4px -4px 0',
          padding: '10px 4px calc(10px + env(safe-area-inset-bottom, 0px))',
          background: 'color-mix(in srgb, var(--admin-content-bg-solid, var(--brand-bg)) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--u-hair)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {state?.error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'color-mix(in srgb, var(--c-danger, #f87171) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)',
              color: 'var(--c-danger, #f87171)',
              fontSize: 14,
            }}
          >
            {state.error}
          </div>
        )}
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isPending ? 'Guardando…' : (<><Icon name="check" size={16} /> {isEdit ? 'Guardar cambios' : 'Crear platillo'}</>)}
        </button>
      </div>
    </form>
  );
}
