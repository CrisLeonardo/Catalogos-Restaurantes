'use client';

/* CatalogPanel — tabla de catálogo estilo prototipo + modal editor de platillo.
   Reemplaza CategoryManager en /admin/menu. */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import {
  createProductModal,
  updateProductModal,
  toggleProductAvailability,
  deleteProduct,
  type ProductModalState,
} from '@/lib/actions/products';
import type { Category, Product, ProductOptionGroup } from '@/types';

/* ── constantes ───────────────────────────────────────────── */

const TAGS = [
  { id: 'hot',  label: 'Picante',   icon: 'flame'   },
  { id: 'new',  label: 'Nuevo',     icon: 'sparkle' },
  { id: 'fav',  label: 'Favorito',  icon: 'star'    },
  { id: 'veg',  label: 'Vegano',    icon: 'leaf'    },
] as const;

const PRODUCT_ICONS = [
  { id: 'utensils',  label: 'General'   },
  { id: 'coffee',    label: 'Café'      },
  { id: 'bagel',     label: 'Bagel'     },
  { id: 'croissant', label: 'Croissant' },
  { id: 'ice',       label: 'Frío'      },
  { id: 'cookie',    label: 'Galleta'   },
  { id: 'flame',     label: 'Picante'   },
  { id: 'leaf',      label: 'Veggie'    },
  { id: 'milk',      label: 'Leche'     },
  { id: 'wheat',     label: 'Pan'       },
  { id: 'star',      label: 'Favorito'  },
  { id: 'sparkle',   label: 'Especial'  },
] as const;

function pickIcon(icon: string | null | undefined): string {
  return icon?.trim() || 'utensils';
}

/* ── CatalogPanel ─────────────────────────────────────────── */

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
}

export default function CatalogPanel({ restaurantId, categories, products }: Props) {
  const [activeCat, setActiveCat] = useState<string>('todos');
  const [editor, setEditor] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const router = useRouter();

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
              <button
                key={c.id}
                className="press"
                onClick={() => setActiveCat(c.id)}
                style={{
                  flexShrink: 0, padding: '8px 14px', borderRadius: 99, cursor: 'pointer',
                  background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.05)',
                  color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                  border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                  fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <button
          className="press"
          onClick={() => setEditor({ open: true, product: null })}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 99, cursor: 'pointer',
            background: 'var(--u-text)', color: 'var(--brand-bg)',
            border: 'none', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          }}
        >
          <Icon name="plus" size={15} /> Nuevo platillo
        </button>
      </div>

      {/* Tabla */}
      {list.length === 0 ? (
        <div
          className="glass"
          style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}
        >
          {products.length === 0
            ? 'No hay platillos aún. ¡Crea el primero!'
            : 'No hay platillos en esta categoría.'}
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
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
            return (
              <div
                key={p.id}
                className="catalog-row"
                style={{
                  padding: '12px 18px',
                  borderBottom: i < list.length - 1 ? '1px solid var(--u-hair)' : 'none',
                  opacity: p.is_available ? 1 : 0.58,
                  transition: 'opacity 160ms',
                }}
              >
                {/* Platillo */}
                <div className="catalog-cell-dish" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 11, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.04)', flexShrink: 0,
                    }}
                  >
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        width={44}
                        height={44}
                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                        unoptimized
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
                  </div>
                </div>

                {/* Precio */}
                <div
                  className="catalog-cell-price"
                  style={{
                    textAlign: 'right', fontFamily: 'var(--ui-font-mono)',
                    fontWeight: 600, fontSize: 14, color: 'var(--u-text)',
                  }}
                >
                  Q{p.price.toFixed(2)}
                </div>

                {/* Toggle disponibilidad */}
                <div className="catalog-cell-avail" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <form action={toggleProductAvailability}>
                    <input type="hidden" name="restaurantId" value={restaurantId} />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="is_available" value={String(!p.is_available)} />
                    <button
                      type="submit"
                      className="press"
                      title={p.is_available ? 'Marcar agotado' : 'Marcar activo'}
                      style={{
                        width: 42, height: 25, borderRadius: 99, border: 'none',
                        cursor: 'pointer', padding: 3,
                        background: p.is_available ? 'var(--u-text)' : 'rgba(255,255,255,0.12)',
                        display: 'flex', justifyContent: p.is_available ? 'flex-end' : 'flex-start',
                        transition: 'background 180ms',
                      }}
                    >
                      <span
                        style={{
                          width: 19, height: 19, borderRadius: 99,
                          background: p.is_available ? 'var(--brand-bg)' : 'rgba(255,255,255,0.9)',
                          transition: 'all 180ms',
                        }}
                      />
                    </button>
                  </form>
                  <span style={{ fontSize: 12, color: p.is_available ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
                    {p.is_available ? 'Activo' : 'Agotado'}
                  </span>
                </div>

                {/* Acciones */}
                <div className="catalog-cell-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="press glass-quiet"
                    onClick={() => setEditor({ open: true, product: p })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 11px', borderRadius: 10, border: 'none',
                      cursor: 'pointer', fontSize: 12, color: 'var(--u-text-2)',
                    }}
                  >
                    <Icon name="edit" size={13} /> Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal editor */}
      {editor.open && (
        <ProductModal
          restaurantId={restaurantId}
          categories={categories}
          product={editor.product}
          catIconMap={catIconMap}
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
  onClose,
  onSaved,
}: {
  restaurantId: string;
  categories: Category[];
  product: Product | null;
  catIconMap: Map<string, string>;
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
  const [tags,         setTags]         = useState<string[]>(product?.tags ?? []);
  const [options,      setOptions]      = useState<ProductOptionGroup[]>(
    Array.isArray(product?.options) ? product!.options! : [],
  );
  const [uploading,    setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state && 'success' in state) onSaved();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop();
    const path = `${restaurantId}/products/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('restaurant-assets')
      .upload(path, file, { upsert: true });
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

  const previewIcon = productIcon || catIconMap.get(catId) || 'utensils';
  const previewSeed = seedFromString(product?.id ?? 'new');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'grid', placeItems: 'center',
        background: 'rgba(7,7,8,0.65)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Panel */}
      <div
        className="glass-solid anim-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '94vw', maxHeight: '90vh',
          borderRadius: 22, display: 'flex', flexDirection: 'column',
        }}
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
          <button
            type="button"
            onClick={onClose}
            className="press glass-quiet"
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer',
            }}
          >
            <Icon name="x" size={18} />
          </button>
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
          <input type="hidden" name="tags"         value={tags.join(',')} />
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
                  background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                  display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative',
                }}
              >
                {imagePreview ? (
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
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="press glass-quiet"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px',
                    borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)',
                  }}
                >
                  <Icon name="upload" size={14} /> Subir foto
                </button>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => { setImageUrl(''); setImagePreview(''); }}
                    className="press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                      borderRadius: 10, border: '1px solid var(--u-hair)', background: 'transparent',
                      cursor: 'pointer', fontSize: 12, color: 'var(--u-text-4)',
                    }}
                  >
                    <Icon name="x" size={12} /> Quitar foto
                  </button>
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
              placeholder="Ej. Mocha Negra"
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
              <div className="u-noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {PRODUCT_ICONS.map((opt) => {
                  const on = productIcon === opt.id || (!productIcon && opt.id === 'utensils');
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setProductIcon(productIcon === opt.id ? '' : opt.id)}
                      title={opt.label}
                      className="press"
                      style={{
                        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        padding: '8px 10px', borderRadius: 12, cursor: 'pointer', minWidth: 56,
                        border: `1.5px solid ${on ? 'var(--u-text)' : 'var(--u-hair)'}`,
                        background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.03)',
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

            {/* Precio */}
            <ModalField
              label="Precio (Q)"
              name="price"
              defaultValue={product?.price?.toString() ?? ''}
              placeholder="0.00"
              mono
              required
            />

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
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
                  fontFamily: 'var(--font-sans)',
                }}
              />
            </div>

            {/* Etiquetas */}
            <div>
              <label className="t-kicker" style={{ fontSize: 10.5, display: 'block', marginBottom: 8 }}>
                Etiquetas
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TAGS.map((t) => {
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
                        background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
                        color: on ? 'var(--brand-bg)' : 'var(--u-text-3)',
                        fontWeight: 600, fontSize: 12,
                      }}
                    >
                      <Icon name={t.icon} size={12} /> {t.label}
                    </button>
                  );
                })}
              </div>
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

            {/* Disponibilidad */}
            <div
              className="glass-quiet"
              style={{
                borderRadius: 13, padding: '13px 15px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
                  Disponible ahora
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
                  Apagado → sale como &ldquo;Agotado&rdquo;
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAvailable((v) => !v)}
                className="press"
                style={{
                  width: 42, height: 25, borderRadius: 99, border: 'none',
                  cursor: 'pointer', padding: 3,
                  background: isAvailable ? 'var(--u-text)' : 'rgba(255,255,255,0.12)',
                  display: 'flex', justifyContent: isAvailable ? 'flex-end' : 'flex-start',
                  transition: 'background 180ms',
                }}
              >
                <span
                  style={{
                    width: 19, height: 19, borderRadius: 99,
                    background: isAvailable ? 'var(--brand-bg)' : 'rgba(255,255,255,0.9)',
                    transition: 'all 180ms',
                  }}
                />
              </button>
            </div>

            {/* Error */}
            {state && 'error' in state && (
              <div
                style={{
                  padding: '10px 14px', borderRadius: 13,
                  background: 'rgba(220,50,50,0.12)',
                  border: '1px solid rgba(220,50,50,0.25)',
                  color: '#f87171', fontSize: 13,
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
            <button
              type="button"
              onClick={onClose}
              className="press glass-quiet"
              style={{
                flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                cursor: 'pointer', fontSize: 14, color: 'var(--u-text-2)', fontWeight: 500,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="press"
              style={{
                flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
                background: 'var(--u-text)', color: 'var(--brand-bg)',
                opacity: isPending ? 0.7 : 1, transition: 'opacity 160ms',
              }}
            >
              {isPending ? 'Guardando…' : isNew ? 'Crear platillo' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
          fontFamily: mono ? 'var(--ui-font-mono)' : 'var(--font-sans)',
        }}
      />
    </div>
  );
}

function CatChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      style={{
        padding: '8px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
        background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
        color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
      }}
    >
      {label}
    </button>
  );
}
