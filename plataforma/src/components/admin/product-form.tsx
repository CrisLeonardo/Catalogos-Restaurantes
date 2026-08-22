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

/** Etiquetas rápidas — el resto se agrega como texto libre. */
const PRESET_TAGS = [
  { id: 'hot',  label: 'Picante',   icon: 'flame'   },
  { id: 'new',  label: 'Nuevo',     icon: 'sparkle' },
  { id: 'fav',  label: 'Favorito',  icon: 'star'    },
  { id: 'veg',  label: 'Vegano',    icon: 'leaf'    },
] as const;

/** Ícono del patrón de marca cuando el platillo no tiene foto. */
const PRODUCT_ICONS = [
  { id: 'utensils',  label: 'General',   keywords: ['comida', 'food', 'menu', 'plato', 'general'] },
  { id: 'coffee',    label: 'Café',      keywords: ['cafe', 'coffee', 'expreso', 'latte', 'capuchino', 'americano', 'bebida', 'drink', 'moca', 'mocha'] },
  { id: 'bagel',     label: 'Bagel',     keywords: ['bagel', 'rosquilla'] },
  { id: 'croissant', label: 'Croissant', keywords: ['croissant', 'medialuna'] },
  { id: 'ice',       label: 'Frío',      keywords: ['frio', 'helado', 'smoothie', 'shake', 'frape', 'batido', 'granizado', 'frozen', 'nieve'] },
  { id: 'cookie',    label: 'Galleta',   keywords: ['galleta', 'cookie', 'postre', 'dulce', 'pastel', 'cake', 'torta', 'muffin', 'brownie', 'dessert'] },
  { id: 'flame',     label: 'Picante',   keywords: ['picante', 'hot', 'spicy', 'salsa', 'chile', 'habanero', 'jalap'] },
  { id: 'leaf',      label: 'Veggie',    keywords: ['vegano', 'veggie', 'vegetariano', 'ensalada', 'salad', 'fresco', 'saludable', 'green', 'organico'] },
  { id: 'milk',      label: 'Leche',     keywords: ['leche', 'lacteo', 'dairy', 'milk', 'yogur', 'yogurt', 'queso', 'cheese'] },
  { id: 'wheat',     label: 'Pan',       keywords: ['pan', 'panaderia', 'pizza', 'pasta', 'harina', 'trigo', 'bread', 'empanada', 'wrap', 'taco', 'baguette'] },
  { id: 'star',      label: 'Favorito',  keywords: ['favorito', 'especial', 'premium', 'top', 'mejor', 'star', 'signature'] },
  { id: 'sparkle',   label: 'Especial',  keywords: ['nuevo', 'new', 'novedad', 'fresh', 'especial', 'destacado', 'temporada', 'seasonal'] },
];

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function suggestIconFromName(name: string): string {
  const n = fold(name);
  for (const icon of PRODUCT_ICONS) {
    if (icon.keywords.some((kw) => n.includes(kw))) return icon.id;
  }
  return 'utensils';
}

/** Encabezado de sección: título + explicación corta de para qué sirve. */
function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

/** Interruptor visual compartido por "Disponible" y "Platillo activo". */
function ToggleSwitch({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--brand-accent)' : 'var(--u-hair-2)',
        position: 'relative',
        transition: 'background 200ms',
        flexShrink: 0,
      }}
      aria-label={ariaLabel}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 200ms',
        }}
      />
    </button>
  );
}

export default function ProductForm({ restaurantId, categories, product, defaultCategoryId, ingredients, initialRecipe }: ProductFormProps) {
  const isEdit = Boolean(product);
  const action = isEdit ? updateProduct : createProduct;

  const [state, formAction, isPending] = useActionState(action, emptyState);
  const [imageUrl, setImageUrl] = useState<string>(product?.image_url ?? '');
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [priceVal, setPriceVal] = useState<string>(product?.price != null ? String(product.price) : '');
  const [costVal, setCostVal] = useState<string>(product?.cost != null ? String(product.cost) : '');
  const [loyaltyPtsVal, setLoyaltyPtsVal] = useState<string>(product?.loyalty_points != null ? String(product.loyalty_points) : '');
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [customTagInput, setCustomTagInput] = useState('');
  const [icon, setIcon] = useState<string>(product?.icon ?? '');
  const [iconSearch, setIconSearch] = useState('');

  function toggleTag(id: string) {
    setTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function addCustomTag() {
    const t = customTagInput.trim();
    if (!t || tags.includes(t)) { setCustomTagInput(''); return; }
    setTags((prev) => [...prev, t]);
    setCustomTagInput('');
  }
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
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="is_available" value={String(isAvailable)} />
      <input type="hidden" name="is_active" value={String(isActive)} />
      <input type="hidden" name="options" value={JSON.stringify(cleanOptions(options))} />
      <input type="hidden" name="dietary_tags" value={dietaryTags.join(',')} />
      <input type="hidden" name="tags" value={tags.join(',')} />

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
                <label style={labelStyle}>Etiquetas</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {PRESET_TAGS.map((t) => {
                    const on = tags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="press"
                        onClick={() => toggleTag(t.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                          background: on ? 'var(--u-text)' : 'transparent',
                          color: on ? 'var(--brand-bg)' : 'var(--u-text)',
                          fontWeight: 600, fontSize: 12,
                        }}
                      >
                        <Icon name={t.icon} size={12} /> {t.label}
                      </button>
                    );
                  })}
                  {tags.filter((t) => !PRESET_TAGS.some((p) => p.id === t)).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="press"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                        border: '1px solid transparent',
                        background: 'var(--u-text)', color: 'var(--brand-bg)',
                        fontWeight: 600, fontSize: 12,
                      }}
                    >
                      {t} <Icon name="x" size={10} />
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                    placeholder="Etiqueta personalizada…"
                    maxLength={30}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={addCustomTag}
                    className="press"
                    style={{
                      padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)',
                      background: 'transparent', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 6, display: 'block' }}>
                  Aparecen como sellos sobre la foto del platillo.
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
                  Costo{hasRecipe && <span style={{ color: 'var(--brand-accent-ink)', marginLeft: 6, fontSize: 10, fontWeight: 400 }}>desde receta</span>}
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
                <a href="/admin/modulos" style={{ color: 'var(--brand-accent-ink)', textDecoration: 'none', fontWeight: 600 }}>
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

          {/* ── Ícono del patrón (fallback sin foto) ── */}
          <Glass variant="quiet" style={{ padding: 18 }}>
            <SectionHead title="Ícono del patrón" hint="Se usa como fondo si el platillo no tiene foto." />
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => {
                const v = e.target.value;
                setIconSearch(v);
                const suggested = v.trim() ? suggestIconFromName(v) : '';
                if (suggested && v.trim()) setIcon(suggested);
              }}
              placeholder="Buscar (ej: pizza, café, helado…)"
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <div className="u-noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {PRODUCT_ICONS.filter((opt) => {
                if (!iconSearch.trim()) return true;
                const q = fold(iconSearch);
                return fold(opt.label).includes(q) || opt.keywords.some((kw) => kw.includes(q));
              }).map((opt) => {
                const on = icon === opt.id || (!icon && opt.id === 'utensils');
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setIcon(icon === opt.id ? '' : opt.id); setIconSearch(''); }}
                    title={opt.label}
                    className="press"
                    style={{
                      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '8px 10px', borderRadius: 12, cursor: 'pointer', minWidth: 56,
                      border: `1.5px solid ${on ? 'var(--u-text)' : 'var(--u-hair-2)'}`,
                      background: on ? 'var(--u-text)' : 'transparent',
                      color: on ? 'var(--brand-bg)' : 'var(--u-text-3)',
                      transition: 'all 140ms',
                    }}
                  >
                    <Icon name={opt.id} size={18} />
                    <span style={{ fontSize: 9.5, fontWeight: 600 }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
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
              <ToggleSwitch checked={isAvailable} onChange={() => setIsAvailable(!isAvailable)} ariaLabel="Disponibilidad" />
            </div>
          </Glass>

          {/* ── Activar / desactivar (oculto permanente, distinto de "Disponible") ── */}
          <Glass
            variant="quiet"
            style={{ padding: '14px 18px', borderColor: !isActive ? 'var(--c-danger-line)' : undefined }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? 'var(--u-text)' : 'var(--c-danger)' }}>
                  {isActive ? 'Platillo activo' : 'Platillo desactivado'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                  Desactivado → no aparece en el menú hasta que lo reactives
                </div>
              </div>
              <ToggleSwitch checked={isActive} onChange={() => setIsActive(!isActive)} ariaLabel="Platillo activo" />
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
              color: 'var(--c-danger)',
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
