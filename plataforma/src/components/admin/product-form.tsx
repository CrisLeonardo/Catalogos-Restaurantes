'use client';

/* ============================================================
   FICHA DEL PLATILLO (crear / editar) · auditoría 1.9
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_CATALOGO_2026-11-09.html.
     · «Lo básico» siempre a la vista: nombre, precio con «Q» y
       categoría, con «+ Nueva categoría» sin salir de la ficha.
     · El resto en secciones plegables que dicen su contenido
       cerradas («Opciones · 1 grupo», «Dietas · Picante»). Al crear,
       sólo «Lo básico» abierto: un platillo de nombre y precio no
       recorre doce casillas.
     · Sellos (comerciales) separados de dietas (seguridad
       alimentaria): escribir «Vegano» como sello ofrece marcar la
       dieta y no se guarda repetido.
     · Inglés sólo con el menú bilingüe activo o si ya hay traducción.
     · «Crear y agregar otro» conserva la categoría.
   Los campos de una sección cerrada siguen en el formulario: cerrar
   no borra nada.
   ============================================================ */

import { useActionState, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import ImageUpload from './image-upload';
import OptionsEditor, { cleanOptions } from '@/components/admin/options-editor';
import RecipeEditor from '@/components/admin/recipe-editor';
import { createProduct, updateProduct, type ProductState } from '@/lib/actions/products';
import { crearCategoriaEnLinea } from '@/lib/actions/categories';
import { DIETARY_TAG_OPTIONS, DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import { dietaDeSello, separarSellos } from '@/lib/catalogo/reglas';
import type { Category, Product, ProductOptionGroup } from '@/types';
import type { Ingredient, RecipeItem } from '@/lib/db/recipes';
import { FIELD_LABEL } from '@/components/admin/field-label';
import SaveBar from '@/components/admin/save-bar';
import { useFormDirty } from '@/lib/use-form-dirty';
/* El prefijo del origen unico para un `<a>` suelto (PanelLink solo cubre
   `<Link>`). Fuera del panel devuelve la ruta tal cual. */
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { fmtMoney } from '@/lib/money';
import s from './product-form.module.css';
import { OpcionesAgotado } from '@/components/admin/hoja-agotar';
import { AGOTADO_POR_OMISION, razonDeAgotado, type AgotadoHasta } from '@/lib/product-availability';

interface ProductFormProps {
  restaurantId: string;
  categories: Category[];
  product?: Product;
  defaultCategoryId?: string;
  ingredients?: Ingredient[];
  initialRecipe?: RecipeItem[];
  /** «Menú también en inglés» encendido en Ajustes. */
  bilingue?: boolean;
  /** Nombre del platillo recién creado con «Crear y agregar otro». */
  creado?: string;
  /** La ficha viene de «Duplicar»: la copia nace oculta. */
  duplicado?: boolean;
  /** A dónde vuelve al guardar (la lista con sus filtros). */
  volver?: string;
  /** Hora de corte del local («05:00»), para decir cuándo vuelve lo agotado. */
  horaCorte?: string;
  timezone?: string;
}

const emptyState: ProductState = null;

const moneyPrefix: React.CSSProperties = {
  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
  fontSize: 14, color: 'var(--u-text-3)', pointerEvents: 'none',
};

/** Sellos comerciales sugeridos. «Picante» y «Vegano» ya no: son dietas. */
const PRESET_TAGS = [
  { id: 'new', label: 'Nuevo', icon: 'sparkle' },
  { id: 'fav', label: 'Favorito', icon: 'star' },
  { id: 'Especial', label: 'Especial', icon: 'tag' },
] as const;

const foldTag = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
/** Si el texto es el nombre de un sello sugerido, su id («Nuevo» → 'new'). */
function presetIdFor(text: string): string | null {
  const f = foldTag(text);
  return PRESET_TAGS.find((p) => foldTag(p.label) === f || foldTag(p.id) === f)?.id ?? null;
}
function normalizeTags(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const t = presetIdFor(raw) ?? raw;
    if (t && !out.some((x) => foldTag(x) === foldTag(t))) out.push(t);
  }
  return out;
}
const etiquetaDeSello = (t: string) => PRESET_TAGS.find((p) => p.id === t)?.label ?? t;

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

function fold(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function suggestIconFromName(name: string): string {
  const n = fold(name);
  for (const icon of PRODUCT_ICONS) {
    if (icon.keywords.some((kw) => n.includes(kw))) return icon.id;
  }
  return 'utensils';
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Sección plegable: cerrada dice lo que contiene. */
function Seccion({ titulo, resumen, abierta = false, children }: {
  titulo: string; resumen: string; abierta?: boolean; children: React.ReactNode;
}) {
  return (
    <details className={s.sec} open={abierta || undefined}>
      <summary>
        {titulo}
        <span className={s.res} title={resumen}>{resumen}</span>
        <Icon name="chevronDown" size={16} className={s.chev} />
      </summary>
      <div className={s.cuerpo}>{children}</div>
    </details>
  );
}

export default function ProductForm({
  restaurantId, categories, product, defaultCategoryId, ingredients, initialRecipe, bilingue = false, creado, duplicado = false, volver, horaCorte, timezone,
}: ProductFormProps) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const isEdit = Boolean(product);
  const action = isEdit ? updateProduct : createProduct;

  const [state, formAction, isPending] = useActionState(action, emptyState);
  /* Al editar, la barra de guardar es la del resto del panel: sale con
     cambios y avisa si te vas sin guardar. */
  const { ref: formRef, dirty } = useFormDirty();
  const siguienteRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState<string>(product?.image_url ?? '');
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  /* Hasta cuándo queda agotado (1.10): lo guardado, o «hasta mañana». */
  const [agotadoHasta, setAgotadoHasta] = useState<AgotadoHasta>(
    product?.agotado_motivo === 'reponer' || product?.agotado_motivo === 'manual' || product?.agotado_motivo === 'manana'
      ? product.agotado_motivo : AGOTADO_POR_OMISION,
  );
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [priceVal, setPriceVal] = useState<string>(product?.price != null ? Number(product.price).toFixed(2) : '');
  const [costVal, setCostVal] = useState<string>(product?.cost != null ? String(product.cost) : '');
  const [loyaltyPtsVal, setLoyaltyPtsVal] = useState<string>(product?.loyalty_points != null ? String(product.loyalty_points) : '');
  const [descripcion, setDescripcion] = useState(product?.description ?? '');

  /* Sellos y dietas separados desde que se abre la ficha: un «Vegano»
     guardado como sello pasa a su dieta (N17). */
  const [inicio] = useState(() => separarSellos(normalizeTags(product?.tags ?? []), product?.dietary_tags ?? []));
  const [tags, setTags] = useState<string[]>(inicio.sellos);
  const [dietaryTags, setDietaryTags] = useState<string[]>(inicio.dietas);
  const [customTagInput, setCustomTagInput] = useState('');
  const [sugerencia, setSugerencia] = useState<{ texto: string; dieta: string } | null>(null);

  const [icon, setIcon] = useState<string>(product?.icon ?? '');
  const [iconSearch, setIconSearch] = useState('');

  /* Categoría con alta en línea (E10). */
  const [cats, setCats] = useState<Category[]>(categories);
  const [catId, setCatId] = useState<string>(product?.category_id ?? defaultCategoryId ?? '');
  const [nuevaCat, setNuevaCat] = useState<string | null>(null);
  const [errorCat, setErrorCat] = useState<string | null>(null);
  const [creandoCat, startCat] = useTransition();

  function crearCategoria() {
    const nombre = (nuevaCat ?? '').trim();
    if (!nombre) { setErrorCat('Escribe el nombre de la categoría.'); return; }
    startCat(async () => {
      const r = await crearCategoriaEnLinea(restaurantId, nombre);
      if (r.error || !r.id) { setErrorCat(r.error ?? 'No se pudo crear la categoría.'); return; }
      setCats((prev) => [...prev, { id: r.id!, name: r.name ?? nombre } as Category]);
      setCatId(r.id);
      setNuevaCat(null);
      setErrorCat(null);
    });
  }

  function toggleTag(id: string) {
    setTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function addCustomTag() {
    const texto = customTagInput.trim();
    setCustomTagInput('');
    if (!texto) return;
    const dieta = dietaDeSello(texto);
    if (dieta) { setSugerencia({ texto, dieta }); return; }
    const t = presetIdFor(texto) ?? texto.slice(0, 30);
    if (!tags.some((x) => foldTag(x) === foldTag(t))) setTags((prev) => [...prev, t]);
  }
  function toggleDietaryTag(key: string) {
    setDietaryTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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

  const conIngles = bilingue || Boolean(product?.name_en || product?.description_en);
  const labelStyle: React.CSSProperties = FIELD_LABEL;

  /* Resúmenes de las secciones cerradas. */
  const p = parseFloat(priceVal);
  const c = hasRecipe ? recipeCost : parseFloat(costVal);
  const conCosto = !isNaN(c) && (hasRecipe || costVal.trim() !== '');
  const margen = conCosto && !isNaN(p) && p > 0 ? Math.round(((p - c) / p) * 100) : null;
  const gruposUtiles = cleanOptions(options).length;
  const resumen = {
    foto: imageUrl ? 'Con foto' : `Sin foto · ícono ${PRODUCT_ICONS.find((o) => o.id === (icon || 'utensils'))?.label ?? 'General'}`,
    descripcion: descripcion.trim() ? descripcion.trim() : 'Vacía',
    opciones: gruposUtiles ? plural(gruposUtiles, 'grupo', 'grupos') : 'Ninguna',
    dietas: dietaryTags.length ? dietaryTags.map((k) => DIETARY_TAG_MAP[k]?.label ?? k).join(', ') : 'Ninguna',
    sellos: tags.length ? tags.map(etiquetaDeSello).join(', ') : 'Ninguno',
    costo: conCosto ? `${fmtMoney(c)}${margen != null ? ` · margen ${margen} %` : ''}` : 'Sin costo',
    estado: `${isAvailable ? 'Disponible' : 'Agotado'} · ${isActive ? 'visible' : 'oculto'}`,
  };

  return (
    <form ref={formRef} action={formAction} className={s.ficha}>
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
      <input type="hidden" name="category_id" value={catId} />
      <input type="hidden" name="siguiente" ref={siguienteRef} defaultValue="" />
      {volver && <input type="hidden" name="volver" value={volver} />}
      {!isAvailable && <input type="hidden" name="agotado_hasta" value={agotadoHasta} />}

      {creado && (
        <div className={s.aviso} role="status">
          <Icon name="check" size={18} />
          <span><strong>«{creado}»</strong> quedó en tu menú. Escribe el siguiente; la categoría se conserva.</span>
        </div>
      )}
      {duplicado && (
        <div className={`${s.aviso} ${s.avisoInfo}`} role="status">
          <Icon name="eyeOff" size={18} />
          <span>
            Es una copia: trae opciones, dietas, sellos, foto y receta, pero <strong>está oculta</strong> hasta que la revises.
            Cambia el nombre y enciende «Mostrar en el menú» en Disponibilidad.
          </span>
        </div>
      )}

      {/* ── Lo básico ── */}
      <section className={s.basico} aria-labelledby="ficha-basico">
        <h2 id="ficha-basico" className={s.titulo}>Lo básico</h2>
        <div className={s.basicoGrid}>
          <div>
            <label htmlFor="name" style={labelStyle}>Nombre *</label>
            <input id="name" name="name" type="text" required maxLength={120}
              defaultValue={product?.name ?? ''} placeholder="Ej: Pepián de pollo" className="adm-field" autoFocus={!isEdit} />
          </div>
          <div>
            <label htmlFor="price" style={labelStyle}>Precio *</label>
            {/* Con la «Q» dentro: un número suelto no dice que es dinero (MEN-05). */}
            <div style={{ position: 'relative' }}>
              <span aria-hidden style={moneyPrefix}>Q</span>
              <input id="price" name="price" type="number" inputMode="decimal" required min="0" step="0.01"
                value={priceVal} onChange={(e) => setPriceVal(e.target.value)} placeholder="0.00"
                className="adm-field tabular-nums" style={{ paddingLeft: 30 }} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="category_select" style={labelStyle}>Categoría</label>
          <div className={s.categoria}>
            <select id="category_select" value={catId} onChange={(e) => setCatId(e.target.value)} className="adm-field">
              <option value="">Sin categoría</option>
              {cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            {nuevaCat === null && (
              <button type="button" className={s.enlace} onClick={() => { setNuevaCat(''); setErrorCat(null); }}>
                + Nueva categoría
              </button>
            )}
          </div>
          {nuevaCat !== null && (
            <div className={s.nuevaCat} style={{ marginTop: 8 }}>
              <input
                type="text" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} maxLength={60} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearCategoria(); } if (e.key === 'Escape') setNuevaCat(null); }}
                placeholder="Nombre de la categoría" aria-label="Nombre de la nueva categoría" className="adm-field"
              />
              <Button type="button" size="touch" onClick={crearCategoria} disabled={creandoCat}>
                {creandoCat ? 'Creando…' : 'Crear categoría'}
              </Button>
              <Button type="button" size="touch" variant="ghost" onClick={() => { setNuevaCat(null); setErrorCat(null); }}>Cancelar</Button>
            </div>
          )}
          {errorCat && <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: '6px 0 0' }}>{errorCat}</p>}
        </div>
      </section>

      {/* ── Foto e ícono ── */}
      <Seccion titulo="Foto" resumen={resumen.foto}>
        <p className={s.nota}>Una buena foto vende más: se muestra en el menú y al abrir el platillo.</p>
        <ImageUpload restaurantId={restaurantId} currentUrl={product?.image_url} folder="products" onUpload={setImageUrl} />
        <div>
          <div className={s.subtitulo}>Ícono si no hay foto</div>
          <input
            type="text" value={iconSearch}
            onChange={(e) => {
              const v = e.target.value;
              setIconSearch(v);
              if (v.trim()) setIcon(suggestIconFromName(v));
            }}
            placeholder="Buscar (ej: pizza, café, helado…)" aria-label="Buscar ícono" className="adm-field" style={{ marginBottom: 10 }}
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
                  key={opt.id} type="button" title={opt.label} className="press" aria-pressed={on}
                  onClick={() => { setIcon(icon === opt.id ? '' : opt.id); setIconSearch(''); }}
                  style={{
                    flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '8px 10px', borderRadius: 'var(--radius-lg)', cursor: 'pointer', minWidth: 56,
                    border: `1.5px solid ${on ? 'var(--u-text)' : 'var(--adm-border-2)'}`,
                    background: on ? 'var(--u-text)' : 'var(--adm-card)',
                    color: on ? 'var(--adm-card)' : 'var(--u-text-3)',
                  }}
                >
                  <Icon name={opt.id} size={18} />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Seccion>

      {/* ── Descripción (e inglés si aplica) ── */}
      <Seccion titulo="Descripción" resumen={resumen.descripcion}>
        <div>
          <label htmlFor="description" style={labelStyle}>Descripción</label>
          <textarea
            id="description" name="description" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué lleva, tamaño, qué lo hace especial…" className="adm-field" style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
        {conIngles ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label htmlFor="name_en" style={labelStyle}>Nombre en inglés</label>
              <input id="name_en" name="name_en" type="text" defaultValue={product?.name_en ?? ''} placeholder="Opcional" className="adm-field" />
            </div>
            <div>
              <label htmlFor="description_en" style={labelStyle}>Descripción en inglés</label>
              <input id="description_en" name="description_en" type="text" defaultValue={product?.description_en ?? ''} placeholder="Opcional" className="adm-field" />
            </div>
          </div>
        ) : (
          <p className={s.nota}>El nombre en inglés aparece aquí cuando actives «Menú también en inglés» en Ajustes.</p>
        )}
      </Seccion>

      {/* ── Opciones ── */}
      <Seccion titulo="Opciones" resumen={resumen.opciones}>
        <p className={s.nota}>
          Lo que el cliente elige al pedir: tamaños, extras con precio o los componentes de un combo. En «elegir 1» marca
          la opción predeterminada; en «varios», cuántas como mínimo y como máximo.
        </p>
        <OptionsEditor value={options} onChange={setOptions} />
      </Seccion>

      {/* ── Dietas y alérgenos ── */}
      <Seccion titulo="Dietas y alérgenos" resumen={resumen.dietas}>
        <p className={s.nota}>Información de seguridad alimentaria: el comensal la ve con su ícono y no se puede ocultar.</p>
        {(['diet', 'allergen'] as const).map((kind) => (
          <div key={kind}>
            <div className={s.subtitulo}>{kind === 'diet' ? 'Apto para' : 'Contiene'}</div>
            <div className={s.chips}>
              {DIETARY_TAG_OPTIONS.filter((o) => o.kind === kind).map((o) => {
                const on = dietaryTags.includes(o.key);
                return (
                  <button key={o.key} type="button" className={`${s.chip} press`} aria-pressed={on} onClick={() => toggleDietaryTag(o.key)}>
                    <span aria-hidden>{o.icon}</span> {o.label}
                    {on && <Icon name="check" size={13} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Seccion>

      {/* ── Sellos ── */}
      <Seccion titulo="Sellos" resumen={resumen.sellos}>
        <p className={s.nota}>Sellos comerciales sobre la foto del platillo. Las dietas («Vegano», «Picante»…) van en su sección.</p>
        <div className={s.chips}>
          {PRESET_TAGS.map((t) => {
            const on = tags.includes(t.id);
            return (
              <button key={t.id} type="button" className={`${s.chip} press`} aria-pressed={on} onClick={() => toggleTag(t.id)}>
                <Icon name={t.icon} size={13} /> {t.label}
              </button>
            );
          })}
          {tags.filter((t) => !PRESET_TAGS.some((p2) => p2.id === t)).map((t) => (
            <button key={t} type="button" className={`${s.chip} press`} aria-pressed onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
              aria-label={`Quitar el sello ${t}`}>
              {t} <Icon name="x" size={12} />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={customTagInput} onChange={(e) => setCustomTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
            placeholder="Otro sello…" aria-label="Otro sello" maxLength={30} className="adm-field" style={{ flex: 1 }}
          />
          <Button type="button" variant="secondary" size="touch" onClick={addCustomTag}>Agregar</Button>
        </div>
        {sugerencia && (
          <div className={s.sugiere} role="status">
            <span><strong>«{sugerencia.texto}» es una dieta.</strong> Márcala en Dietas para que el menú la muestre con su ícono y no se repita.</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => {
              setDietaryTags((prev) => (prev.includes(sugerencia.dieta) ? prev : [...prev, sugerencia.dieta]));
              setSugerencia(null);
            }}>
              Marcar dieta {DIETARY_TAG_MAP[sugerencia.dieta]?.label ?? sugerencia.texto}
            </Button>
          </div>
        )}
      </Seccion>

      {/* ── Costo y puntos ── */}
      <Seccion titulo="Costo y puntos" resumen={resumen.costo}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="cost" style={labelStyle}>
              Costo{hasRecipe && <span style={{ color: 'var(--brand-accent-ink)', marginLeft: 6, fontSize: 12, fontWeight: 400 }}>desde receta</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <span aria-hidden style={moneyPrefix}>Q</span>
              <input
                id="cost" name="cost" type="number" inputMode="decimal" min="0" step="0.0001"
                value={hasRecipe ? displayCost : costVal}
                onChange={hasRecipe ? undefined : (e) => setCostVal(e.target.value)}
                readOnly={hasRecipe} placeholder="0.00"
                className="adm-field tabular-nums" style={{ paddingLeft: 30, opacity: hasRecipe ? 0.65 : 1 }}
                title={hasRecipe ? 'Calculado automáticamente desde la receta' : undefined}
              />
            </div>
          </div>
          <div>
            <label htmlFor="loyalty_points" style={labelStyle}>Puntos de lealtad</label>
            <input id="loyalty_points" name="loyalty_points" type="number" inputMode="numeric" min="0" step="1"
              value={loyaltyPtsVal} onChange={(e) => setLoyaltyPtsVal(e.target.value)} placeholder="Regla general" className="adm-field" />
          </div>
        </div>
        {conCosto && !isNaN(p) ? (
          <p className={s.nota}>
            Utilidad <strong style={{ color: p - c >= 0 ? 'var(--u-text)' : 'var(--c-danger)' }}>{fmtMoney(p - c)}</strong>
            {margen != null && <> · margen <strong style={{ color: p - c >= 0 ? 'var(--u-text)' : 'var(--c-danger)' }}>{margen} %</strong></>} por venta.
          </p>
        ) : (
          <p className={s.nota}>Con el costo verás tu utilidad y margen. Puntos vacíos usan la regla general; 0 = no da puntos.</p>
        )}
      </Seccion>

      {/* ── Receta (sólo en edición) ── */}
      {product && ingredients && (
        <Seccion titulo="Receta" resumen={hasRecipe ? `Costo ${fmtMoney(recipeCost!)}` : 'Sin receta'}>
          <p className={s.nota}>Ingredientes y cantidades: el costo del platillo se calcula solo. Si se acaba un ingrediente, en Ingredientes «Se acabó» agota los platillos que lo llevan.</p>
          <RecipeEditor
            productId={product.id} restaurantId={restaurantId} ingredients={ingredients}
            initialRecipe={initialRecipe ?? []} onCostChange={(cc) => setRecipeCost(cc)}
          />
        </Seccion>
      )}
      {product && !ingredients && (
        <p className={s.nota}>
          Para llevar el costo por receta activa <strong>Recetas e ingredientes</strong> en{' '}
          <a href={panelHref(base, '/admin/modulos')} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600 }}>Funciones</a>.
        </p>
      )}

      {/* ── Disponibilidad ── */}
      <Seccion titulo="Disponibilidad" resumen={resumen.estado} abierta={duplicado}>
        <div className={s.estado}>
          <div>
            <div id="ficha-disponible" style={{ fontSize: 14, fontWeight: 600 }}>{isAvailable ? 'Hay existencias' : 'Agotado'}</div>
            <div className={s.nota}>
              {isAvailable
                ? 'Se puede pedir. Apágalo si se acabó.'
                : product && product.is_available === false && product.agotado_motivo === agotadoHasta
                  ? `${razonDeAgotado(product, timezone)}. Se ve en el menú pero no se puede pedir.`
                  : 'Se ve en el menú pero no se puede pedir. ¿Hasta cuándo?'}
            </div>
          </div>
          <Switch checked={isAvailable} onCheckedChange={setIsAvailable} aria-labelledby="ficha-disponible" />
        </div>
        {!isAvailable && (
          <OpcionesAgotado value={agotadoHasta} onChange={setAgotadoHasta} name="ficha-agotado-hasta" horaCorte={horaCorte} />
        )}
        <div className={s.estado}>
          <div>
            <div id="ficha-visible" style={{ fontSize: 14, fontWeight: 600, color: isActive ? 'var(--u-text)' : 'var(--c-danger)' }}>
              {isActive ? 'Mostrar en el menú' : 'Oculto del menú'}
            </div>
            <div className={s.nota}>
              {isActive ? 'Tus clientes lo ven en tu menú.' : 'No aparece en el menú hasta que lo vuelvas a encender.'}
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} aria-labelledby="ficha-visible" />
        </div>
      </Seccion>

      {/* ── Guardar ── */}
      {isEdit ? (
        <SaveBar dirty={dirty} pending={isPending} status={state?.error ? { error: state.error } : null} label="Guardar cambios" />
      ) : (
        <div className="pform-savebar">
          {state?.error && (
            <div role="alert" style={{
              padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)',
              border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 14,
            }}>
              {state.error}
            </div>
          )}
          <div className={s.pie}>
            <Button type="submit" size="touch" disabled={isPending} onClick={() => { if (siguienteRef.current) siguienteRef.current.value = ''; }}>
              {isPending ? 'Guardando…' : (<><Icon name="check" size={16} /> Crear platillo</>)}
            </Button>
            <Button type="submit" size="touch" variant="secondary" disabled={isPending}
              onClick={() => { if (siguienteRef.current) siguienteRef.current.value = 'otro'; }}>
              Crear y agregar otro
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
