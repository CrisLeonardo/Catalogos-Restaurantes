'use client';

/* CatalogPanel — tabla de catálogo estilo prototipo + modal editor de platillo.
   Reemplaza CategoryManager en /admin/menu. */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/components/admin/image-upload';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import RecipeEditor from '@/components/admin/recipe-editor';
import {
  createProductModal,
  updateProductModal,
  toggleProductAvailability,
  type ProductModalState,
} from '@/lib/actions/products';
import { getRecipeForProduct } from '@/lib/actions/recipes';
import { DIETARY_TAG_OPTIONS } from '@/lib/dietary-tags';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { Category, Product, ProductOptionGroup } from '@/types';
import type { Ingredient, RecipeItem } from '@/lib/db/recipes';

/* ── constantes ───────────────────────────────────────────── */

const PRESET_TAGS = [
  { id: 'hot',  label: 'Picante',   icon: 'flame'   },
  { id: 'new',  label: 'Nuevo',     icon: 'sparkle' },
  { id: 'fav',  label: 'Favorito',  icon: 'star'    },
  { id: 'veg',  label: 'Vegano',    icon: 'leaf'    },
] as const;

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

function calcProductPrice(p: Product): { total: number; hasCombo: boolean; hasSizes: boolean; hasExtras: boolean } {
  const opts = Array.isArray(p.options) ? p.options : [];
  const hasCombo   = opts.some((g) => g.type === 'combo');
  const hasSizes   = opts.some((g) => g.type === 'single' && g.choices.some((c) => (c.priceDelta || 0) !== 0));
  const hasExtras  = opts.some((g) => g.type === 'multi');
  const comboDelta = opts
    .filter((g) => g.type === 'combo')
    .reduce((sum, g) => sum + g.choices.reduce((s, c) => s + (Number(c.priceDelta) || 0), 0), 0);
  return { total: p.price + comboDelta, hasCombo, hasSizes, hasExtras };
}

function suggestIconFromName(name: string): string {
  const n = fold(name);
  for (const icon of PRODUCT_ICONS) {
    if (icon.keywords.some((kw) => n.includes(kw))) return icon.id;
  }
  return 'utensils';
}

function pickIcon(icon: string | null | undefined): string {
  return icon?.trim() || 'utensils';
}

/* ── CatalogPanel ─────────────────────────────────────────── */

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
  /** Insumos del restaurante (solo si el módulo de recetas está activo). */
  ingredients?: Ingredient[];
  /** ¿El módulo de recetas/ingredientes está activo? */
  recetasActive?: boolean;
  /** Tope de productos del plan (solo el plan gratuito lo trae, ver PLANS.BASICO.maxProducts). */
  maxProducts?: number;
}

export default function CatalogPanel({ restaurantId, categories, products, ingredients = [], recetasActive = false, maxProducts }: Props) {
  const [activeCat, setActiveCat] = useState<string>('todos');
  const [editor, setEditor] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const router = useRouter();
  const availForms = useRef<Record<string, HTMLFormElement | null>>({});

  const atProductLimit = maxProducts != null && products.length >= maxProducts;
  const nearProductLimit = maxProducts != null && !atProductLimit && products.length >= maxProducts * 0.8;

  const catIconMap = new Map(categories.map((c) => [c.id, pickIcon(c.icon)]));
  const list = products.filter(
    (p) => activeCat === 'todos' || p.category_id === activeCat,
  );

  function closeEditor() { setEditor({ open: false, product: null }); }
  function handleSaved()  { closeEditor(); router.refresh(); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Chips + botón nuevo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1 }}>
          {[{ id: 'todos', name: 'Todas' }, ...categories].map((c) => {
            const on = c.id === activeCat;
            return (
              <Button
                key={c.id}
                variant={on ? 'primary' : 'secondary'}
                size="sm"
                className="shrink-0 rounded-adm-full"
                onClick={() => setActiveCat(c.id)}
              >
                {c.name}
              </Button>
            );
          })}
        </div>
        {maxProducts != null && (
          <span
            className="shrink-0"
            style={{
              fontSize: 11.5, fontWeight: 600,
              color: atProductLimit ? '#f87171' : nearProductLimit ? '#fb923c' : 'var(--u-text-4)',
            }}
          >
            {products.length}/{maxProducts} productos
          </span>
        )}
        {atProductLimit ? (
          <Link href="/admin/suscripcion" className="shrink-0">
            <Button variant="secondary" className="rounded-adm-full">
              <Icon name="key" size={15} /> Sube de plan para más
            </Button>
          </Link>
        ) : (
          <Button
            onClick={() => setEditor({ open: true, product: null })}
            data-tour-step="catalogo-nuevo"
            className="shrink-0 rounded-adm-full"
          >
            <Icon name="plus" size={15} /> Nuevo platillo
          </Button>
        )}
      </div>

      {/* Tabla */}
      {list.length === 0 ? (
        <Card className="p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
          {products.length === 0
            ? 'No hay platillos aún. ¡Crea el primero!'
            : 'No hay platillos en esta categoría.'}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Header */}
          <div
            className="catalog-head"
            style={{ padding: '10px 18px', borderBottom: '1px solid var(--u-hair)' }}
          >
            {(['Platillo', 'Precio', 'Disponible', ''] as const).map((h, i) => (
              <div
                key={i}
                className="t-kicker"
                style={{ fontSize: 9.5, textAlign: i === 1 ? 'right' : 'left' }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Filas */}
          {list.map((p, i) => {
            const icon = catIconMap.get(p.category_id ?? '') ?? 'utensils';
            const { total, hasCombo, hasSizes, hasExtras } = calcProductPrice(p);
            const tags = p.tags ?? [];
            const hasBadges = hasCombo || hasSizes || hasExtras || tags.length > 0;
            return (
              <div
                key={p.id}
                className="catalog-row"
                style={{
                  padding: '12px 18px',
                  borderBottom: i < list.length - 1 ? '1px solid var(--u-hair)' : 'none',
                  opacity: p.is_active ? (p.is_available ? 1 : 0.58) : 0.42,
                  transition: 'opacity 160ms',
                }}
              >
                {/* Platillo */}
                <div className="catalog-cell-dish" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 11, overflow: 'hidden',
                      background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', flexShrink: 0,
                    }}
                  >
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        width={44}
                        height={44}
                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      />
                    ) : (
                      <BrandPattern icon={icon} seed={seedFromString(p.id)} iconScale={0.85} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                        color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300,
                      }}
                    >
                      {p.description ?? '—'}
                    </div>
                    {hasBadges && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                        {hasCombo  && <RowBadge label="Combo"   color="#16a34a" bg="rgba(22,163,74,0.12)" />}
                        {hasSizes  && <RowBadge label="Tamaños" color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />}
                        {hasExtras && <RowBadge label="Extras"  color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />}
                        {tags.map((t) => <RowBadge key={t} label={t} color="var(--u-text-3)" bg="color-mix(in srgb, var(--u-text) 6%, transparent)" />)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Precio */}
                <div
                  className="catalog-cell-price"
                  style={{ textAlign: 'right' }}
                >
                  {hasSizes && (
                    <div style={{ fontSize: 9.5, color: 'var(--u-text-4)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 1 }}>
                      DESDE
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
                    Q{total.toFixed(2)}
                  </div>
                  {hasCombo && total !== p.price && (
                    <div style={{ fontSize: 9.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                      base Q{p.price.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Toggle disponibilidad */}
                <div className="catalog-cell-avail" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {!p.is_active ? (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-danger, #f87171)', padding: '3px 8px', borderRadius: 99, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
                      Desactivado
                    </span>
                  ) : (
                    <>
                      <form ref={(el) => { availForms.current[p.id] = el; }} action={toggleProductAvailability}>
                        <input type="hidden" name="restaurantId" value={restaurantId} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="is_available" value={String(!p.is_available)} />
                        <Switch
                          checked={p.is_available}
                          onCheckedChange={() => availForms.current[p.id]?.requestSubmit()}
                          aria-label={p.is_available ? 'Marcar agotado' : 'Marcar activo'}
                        />
                      </form>
                      <span style={{ fontSize: 12, color: p.is_available ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
                        {p.is_available ? 'Activo' : 'Agotado'}
                      </span>
                    </>
                  )}
                </div>

                {/* Acciones */}
                <div className="catalog-cell-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditor({ open: true, product: p })}
                  >
                    <Icon name="edit" size={13} /> Editar
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Modal editor */}
      {editor.open && (
        <ProductModal
          restaurantId={restaurantId}
          categories={categories}
          product={editor.product}
          catIconMap={catIconMap}
          ingredients={ingredients}
          recetasActive={recetasActive}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/* ── ProductModal ─────────────────────────────────────────── */

function ProductModal({
  restaurantId,
  categories,
  product,
  catIconMap,
  ingredients = [],
  recetasActive = false,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  categories: Category[];
  product: Product | null;
  catIconMap: Map<string, string>;
  ingredients?: Ingredient[];
  recetasActive?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !product;
  const action = isNew ? createProductModal : updateProductModal;
  const [state, formAction, isPending] = useActionState<ProductModalState, FormData>(action, null);

  const [imageUrl,     setImageUrl]     = useState<string>(product?.image_url ?? '');
  const [imagePreview, setImagePreview] = useState<string>(product?.image_url ?? '');
  const [catId,        setCatId]        = useState<string>(product?.category_id ?? '');
  const [productIcon,  setProductIcon]  = useState<string>(product?.icon ?? '');
  const [isAvailable,  setIsAvailable]  = useState<boolean>(product?.is_available ?? true);
  const [isActive,     setIsActive]     = useState<boolean>(product?.is_active ?? true);
  const [tags,         setTags]         = useState<string[]>(product?.tags ?? []);
  const [dietaryTags,  setDietaryTags]  = useState<string[]>(product?.dietary_tags ?? []);
  const [customTagInput, setCustomTagInput] = useState('');
  const [iconSearch,   setIconSearch]   = useState('');
  const [options,      setOptions]      = useState<ProductOptionGroup[]>(
    Array.isArray(product?.options) ? product!.options! : [],
  );
  const [priceVal,     setPriceVal]     = useState<string>(product?.price?.toString() ?? '');
  const [costVal,      setCostVal]      = useState<string>(product?.cost != null ? String(product.cost) : '');
  const [loyaltyPtsVal, setLoyaltyPtsVal] = useState<string>(product?.loyalty_points != null ? String(product.loyalty_points) : '');
  const [uploading,    setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Receta (solo platillos existentes): se carga perezosamente al abrir el modal.
  const showRecipe = recetasActive && !isNew;
  const [recipe,       setRecipe]       = useState<RecipeItem[] | null>(null);
  const [recipeLoading, setRecipeLoading] = useState<boolean>(showRecipe);
  // null = costo manual; número = costo calculado desde la receta.
  const [recipeCost,   setRecipeCost]   = useState<number | null>(null);
  const hasRecipe = recipeCost !== null;
  const displayCost = hasRecipe ? recipeCost.toFixed(2) : costVal;

  useEffect(() => {
    if (state && 'success' in state) onSaved();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Carga perezosa de la receta del platillo al abrir el editor.
  useEffect(() => {
    if (!showRecipe || !product) return;
    let cancelled = false;
    (async () => {
      const res = await getRecipeForProduct(product.id, restaurantId);
      if (cancelled) return;
      const lines = res.recipe ?? [];
      setRecipe(lines);
      setRecipeCost(lines.length > 0 ? lines.reduce((acc, l) => acc + l.line_cost, 0) : null);
      setRecipeLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecipe, product?.id, restaurantId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    const upload = await compressImage(file);
    const supabase = createClient();
    const ext = upload.name.split('.').pop();
    const path = `${restaurantId}/products/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('restaurant-assets')
      .upload(path, upload, { upsert: true });
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage
        .from('restaurant-assets')
        .getPublicUrl(data.path);
      setImageUrl(publicUrl);
      setImagePreview(publicUrl);
    }
    setUploading(false);
  }

  function toggleTag(id: string) {
    setTags((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleDietaryTag(key: string) {
    setDietaryTags((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
  }

  function addCustomTag() {
    const t = customTagInput.trim();
    if (!t || tags.includes(t)) { setCustomTagInput(''); return; }
    setTags((prev) => [...prev, t]);
    setCustomTagInput('');
  }

  const previewIcon = productIcon || catIconMap.get(catId) || 'utensils';
  const previewSeed = seedFromString(product?.id ?? 'new');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showClose={false}
        className="flex w-[560px] max-w-[94vw] max-h-[90vh] flex-col p-0"
      >
        {/* Cabecera */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px', borderBottom: '1px solid var(--u-hair)', flexShrink: 0,
          }}
        >
          <div className="t-display" style={{ fontSize: 22 }}>
            {isNew ? 'Nuevo platillo' : 'Editar platillo'}
          </div>
          <Button type="button" onClick={onClose} variant="secondary" size="icon" className="size-8.5">
            <Icon name="x" size={18} />
          </Button>
        </div>

        {/* Formulario (incluye cuerpo scrollable + footer) */}
        <form
          action={formAction}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {/* Campos ocultos */}
          <input type="hidden" name="restaurantId" value={restaurantId} />
          {!isNew && <input type="hidden" name="id" value={product!.id} />}
          <input type="hidden" name="image_url"    value={imageUrl} />
          <input type="hidden" name="category_id"  value={catId} />
          <input type="hidden" name="icon"         value={productIcon} />
          <input type="hidden" name="is_available" value={String(isAvailable)} />
          <input type="hidden" name="is_active"    value={String(isActive)} />
          <input type="hidden" name="tags"         value={tags.join(',')} />
          <input type="hidden" name="dietary_tags" value={dietaryTags.join(',')} />
          <input type="hidden" name="options"      value={JSON.stringify(cleanOptions(options))} />

          {/* Cuerpo scrollable */}
          <div
            style={{
              flex: 1, overflowY: 'auto', padding: 22,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            {/* Foto + BrandPattern */}
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press"
                style={{
                  width: 120, height: 120, borderRadius: 16, flexShrink: 0,
                  border: '1.5px dashed var(--u-hair-2)',
                  background: 'var(--surface-1)', cursor: 'pointer',
                  display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative',
                }}
              >
                {imagePreview ? (
                  // Preview local del archivo recién elegido (blob:) — next/image
                  // no optimiza object URLs; <img> es lo correcto aquí.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <BrandPattern icon={previewIcon} seed={previewSeed} iconScale={1.1} />
                  </div>
                )}
                {uploading && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                      display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--u-text-2)',
                    }}
                  >
                    Subiendo…
                  </div>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                <Button type="button" onClick={() => fileRef.current?.click()} variant="secondary" size="sm" className="self-start">
                  <Icon name="upload" size={14} /> Subir foto
                </Button>
                {imagePreview && (
                  <Button
                    type="button"
                    onClick={() => { setImageUrl(''); setImagePreview(''); }}
                    variant="outline"
                    size="sm"
                    className="self-start text-[var(--u-text-4)]"
                  >
                    <Icon name="x" size={12} /> Quitar foto
                  </Button>
                )}
                <p style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.4, margin: 0 }}>
                  JPG, PNG o WebP · máx 5 MB.
                  <br />Sin foto → patrón de marca.
                </p>
              </div>
            </div>

            {/* Nombre */}
            <ModalField
              label="Nombre"
              name="name"
              defaultValue={product?.name ?? ''}
              placeholder="Ej. Café Latte"
              required
            />

            {/* Categoría */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Categoría
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CatChip on={!catId} label="Sin categoría" onClick={() => setCatId('')} />
                {categories.map((c) => (
                  <CatChip key={c.id} on={catId === c.id} label={c.name} onClick={() => setCatId(c.id)} />
                ))}
              </div>
            </div>

            {/* Ícono del patrón */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Ícono del patrón
                <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--u-text-4)' }}>
                  · se usa si el producto no tiene foto
                </span>
              </label>
              {/* Búsqueda de ícono por nombre */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIconSearch(v);
                    const suggested = v.trim() ? suggestIconFromName(v) : '';
                    if (suggested && v.trim()) setProductIcon(suggested);
                  }}
                  placeholder="Escribe para buscar ícono (ej: pizza, café, helado…)"
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10, outline: 'none',
                    fontSize: 13, color: 'var(--u-text)',
                    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
              <div className="u-noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {PRODUCT_ICONS.filter((opt) => {
                  if (!iconSearch.trim()) return true;
                  const q = fold(iconSearch);
                  return fold(opt.label).includes(q) || opt.keywords.some((kw) => kw.includes(q));
                }).map((opt) => {
                  const on = productIcon === opt.id || (!productIcon && opt.id === 'utensils');
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { setProductIcon(productIcon === opt.id ? '' : opt.id); setIconSearch(''); }}
                      title={opt.label}
                      className="press"
                      style={{
                        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        padding: '8px 10px', borderRadius: 12, cursor: 'pointer', minWidth: 56,
                        border: `1.5px solid ${on ? 'var(--u-text)' : 'var(--u-hair)'}`,
                        background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 3%, transparent)',
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
            </div>

            {/* Precio y costo → margen en vivo */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                    Precio (Q)
                  </label>
                  <input
                    name="price"
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.01"
                    required
                    value={priceVal}
                    onChange={(e) => setPriceVal(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 13, outline: 'none',
                      fontSize: 14, color: 'var(--u-text)',
                      background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                      fontFamily: 'var(--ui-font-mono)',
                    }}
                  />
                </div>
                <div>
                  <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                    Costo (Q)
                    {hasRecipe && (
                      <span style={{ color: 'var(--brand-accent)', marginLeft: 6, fontSize: 9, fontWeight: 600 }}>
                        DESDE RECETA
                      </span>
                    )}
                  </label>
                  <input
                    name="cost"
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={hasRecipe ? displayCost : costVal}
                    onChange={hasRecipe ? undefined : (e) => setCostVal(e.target.value)}
                    readOnly={hasRecipe}
                    placeholder="0.00"
                    title={hasRecipe ? 'Calculado automáticamente desde la receta' : undefined}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 13, outline: 'none',
                      fontSize: 14, color: 'var(--u-text)',
                      background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                      fontFamily: 'var(--ui-font-mono)',
                      opacity: hasRecipe ? 0.65 : 1, cursor: hasRecipe ? 'not-allowed' : 'text',
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                  Puntos de lealtad (por unidad)
                </label>
                <input
                  name="loyalty_points"
                  type="number" inputMode="decimal"
                  min="0"
                  step="1"
                  value={loyaltyPtsVal}
                  onChange={(e) => setLoyaltyPtsVal(e.target.value)}
                  placeholder="Vacío = regla general"
                  style={{
                    width: '100%', maxWidth: 240, padding: '12px 14px', borderRadius: 13, outline: 'none',
                    fontSize: 14, color: 'var(--u-text)',
                    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                    fontFamily: 'var(--ui-font-mono)',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 6, display: 'block' }}>
                  Puntos que gana el cliente por unidad. Vacío = regla general del programa; 0 = ninguno.
                </span>
              </div>
              {(() => {
                const p = parseFloat(priceVal);
                const c = hasRecipe ? (recipeCost as number) : parseFloat(costVal);
                const costKnown = hasRecipe || (costVal.trim() !== '' && !isNaN(c));
                const comboDelta = options
                  .filter((g) => g.type === 'combo')
                  .reduce((sum, g) => sum + g.choices.reduce((s, ch) => s + (Number(ch.priceDelta) || 0), 0), 0);
                const totalPrice = (isNaN(p) ? 0 : p) + comboDelta;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 9 }}>
                    {comboDelta > 0 && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 10, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.2)' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>Precio base</span>
                        <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 12, color: 'var(--u-text-2)' }}>Q{isNaN(p) ? '—' : p.toFixed(2)}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>+ combo</span>
                        <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 12, color: 'var(--u-text-2)' }}>Q{comboDelta.toFixed(2)}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--c-ok, #4ade80)' }}>= Q{totalPrice.toFixed(2)}</span>
                      </div>
                    )}
                    {!isNaN(p) && costKnown && (
                      <div style={{ display: 'flex', gap: 16, fontSize: 12.5 }}>
                        <span style={{ color: 'var(--u-text-3)' }}>
                          Utilidad: <strong style={{ color: p - c >= 0 ? 'var(--u-text)' : '#f87171' }}>Q{(p - c).toFixed(2)}</strong>
                        </span>
                        <span style={{ color: 'var(--u-text-3)' }}>
                          Margen: <strong style={{ color: p - c >= 0 ? '#4ade80' : '#f87171' }}>{p > 0 ? (((p - c) / p) * 100).toFixed(0) : 0}%</strong>
                        </span>
                      </div>
                    )}
                    {!costKnown && comboDelta === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
                        Captura el costo para ver utilidad y margen por venta.
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Receta / costeo por ingrediente (solo platillos existentes, módulo activo) */}
            {showRecipe && (
              <div style={{ borderRadius: 13, padding: '14px 15px', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', border: '1px solid var(--u-hair)' }}>
                <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 4 }}>
                  Receta
                  <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--u-text-4)' }}>
                    · define ingredientes y el costo se calcula solo
                  </span>
                </label>
                {recipeLoading ? (
                  <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', padding: '10px 0' }}>Cargando receta…</div>
                ) : (
                  <RecipeEditor
                    productId={product!.id}
                    restaurantId={restaurantId}
                    ingredients={ingredients}
                    initialRecipe={recipe ?? []}
                    onCostChange={setRecipeCost}
                  />
                )}
              </div>
            )}

            {/* Nota de receta para platillos nuevos */}
            {recetasActive && isNew && (
              <div style={{ borderRadius: 13, padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'center', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', border: '1px solid var(--u-hair)' }}>
                <Icon name="flask" size={15} />
                <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
                  Guarda el platillo y vuelve a abrirlo para asignarle su <strong style={{ color: 'var(--u-text-2)' }}>receta</strong> e ingredientes.
                </p>
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                Descripción
              </label>
              <textarea
                name="description"
                rows={3}
                defaultValue={product?.description ?? ''}
                placeholder="Describí los ingredientes o el sabor…"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 13, outline: 'none',
                  resize: 'none', fontSize: 14, color: 'var(--u-text)',
                  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                  fontFamily: 'var(--font-sans)',
                }}
              />
            </div>

            {/* Traducción al inglés (opcional) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                  Nombre (inglés)
                </label>
                <input
                  type="text"
                  name="name_en"
                  defaultValue={product?.name_en ?? ''}
                  placeholder="Opcional"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 11, outline: 'none',
                    fontSize: 13.5, color: 'var(--u-text)',
                    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                  }}
                />
              </div>
              <div>
                <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
                  Descripción (inglés)
                </label>
                <input
                  type="text"
                  name="description_en"
                  defaultValue={product?.description_en ?? ''}
                  placeholder="Opcional"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 11, outline: 'none',
                    fontSize: 13.5, color: 'var(--u-text)',
                    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                  }}
                />
              </div>
            </div>

            {/* Etiquetas */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Etiquetas
              </label>
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
                        padding: '7px 12px', borderRadius: 99, cursor: 'pointer',
                        border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                        background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                        color: on ? 'var(--brand-bg)' : 'var(--u-text-3)',
                        fontWeight: 600, fontSize: 12,
                      }}
                    >
                      <Icon name={t.icon} size={12} /> {t.label}
                    </button>
                  );
                })}
                {/* Etiquetas personalizadas activas */}
                {tags.filter((t) => !PRESET_TAGS.some((p) => p.id === t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="press"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '7px 12px', borderRadius: 99, cursor: 'pointer',
                      border: '1px solid transparent',
                      background: 'var(--u-text)',
                      color: 'var(--brand-bg)',
                      fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {t} <Icon name="x" size={10} />
                  </button>
                ))}
              </div>
              {/* Agregar etiqueta personalizada */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                  placeholder="Etiqueta personalizada…"
                  maxLength={30}
                  style={{
                    flex: 1, padding: '8px 11px', borderRadius: 10, outline: 'none',
                    fontSize: 12.5, color: 'var(--u-text)',
                    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="press"
                  style={{
                    padding: '8px 12px', borderRadius: 10, border: 'none',
                    background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Alérgenos y dietas — vocabulario fijo, no ocultable (info de seguridad alimentaria) */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Alérgenos y dietas
                <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--u-text-4)' }}>
                  · se muestran con ícono en el menú del comensal
                </span>
              </label>
              {(['diet', 'allergen'] as const).map((kind) => (
                <div key={kind} style={{ marginBottom: kind === 'diet' ? 10 : 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--u-text-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    {kind === 'diet' ? 'Apto para' : 'Contiene'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DIETARY_TAG_OPTIONS.filter((o) => o.kind === kind).map((o) => {
                      const on = dietaryTags.includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          className="press"
                          onClick={() => toggleDietaryTag(o.key)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 11px', borderRadius: 99, cursor: 'pointer',
                            border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                            background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                            color: on ? 'var(--brand-bg)' : 'var(--u-text-3)',
                            fontWeight: 600, fontSize: 12,
                          }}
                        >
                          <span aria-hidden>{o.icon}</span> {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Variantes / extras */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Variantes y extras
                <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--u-text-4)' }}>
                  · tamaños, extras con precio… el cliente elige al pedir
                </span>
              </label>
              <OptionsEditor value={options} onChange={setOptions} />
            </div>

            {/* Disponibilidad temporal */}
            <Card variant="flat" className="flex items-center gap-3 p-3.5">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
                  Disponible ahora
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
                  Apagado → se muestra tachado; se restaura solo en 12 h
                </div>
              </div>
              <Switch checked={isAvailable} onCheckedChange={setIsAvailable} aria-label="Disponible ahora" />
            </Card>

            {/* Activar / desactivar platillo (oculto permanente) */}
            <Card
              variant="flat"
              className="flex items-center gap-3 p-3.5"
              style={{ borderColor: !isActive ? 'rgba(248,113,113,0.2)' : undefined }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: isActive ? 'var(--u-text)' : '#f87171' }}>
                  {isActive ? 'Platillo activo' : 'Platillo desactivado'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
                  Desactivado → no aparece en el menú hasta que lo reactives
                </div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Platillo activo" />
            </Card>

            {/* Error */}
            {state && 'error' in state && (
              <div
                style={{
                  padding: '10px 14px', borderRadius: 13,
                  background: 'rgba(220,50,50,0.12)',
                  border: '1px solid rgba(220,50,50,0.25)',
                  color: 'var(--c-danger, #f87171)', fontSize: 13,
                }}
              >
                {state.error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex', gap: 10, padding: '16px 22px',
              borderTop: '1px solid var(--u-hair)', flexShrink: 0,
            }}
          >
            <Button type="button" onClick={onClose} variant="secondary" size="lg" className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} size="lg" className="flex-[2]">
              {isPending ? 'Guardando…' : isNew ? 'Crear platillo' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Helpers de UI ────────────────────────────────────────── */

function ModalField({
  label, name, defaultValue, placeholder, required, mono,
}: {
  label: string; name: string; defaultValue: string;
  placeholder?: string; required?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 13, outline: 'none',
          fontSize: 14, color: 'var(--u-text)',
          background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
          fontFamily: mono ? 'var(--ui-font-mono)' : 'var(--font-sans)',
        }}
      />
    </div>
  );
}

function RowBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 99,
      fontSize: 10, fontWeight: 600, background: bg, color,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function CatChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick} variant={on ? 'primary' : 'secondary'} size="sm">
      {label}
    </Button>
  );
}
