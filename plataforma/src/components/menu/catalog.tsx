'use client';

/* Catálogo del cliente — búsqueda, categorías y platillos.

   Dos ejes de ESTRUCTURA mandan aquí (ver lib/theme/defaults.ts):

     · config.catalogNav → cómo se recorre la carta
         'chips'      píldoras que filtran UNA categoría (el clásico)
         'secciones'  todas apiladas, scroll continuo + índice pegajoso
         'acordeon'   categorías plegadas, se abre una a la vez
         'portadas'   se elige categoría en tarjetas grandes y se entra

     · config.cardStyle → qué forma tiene cada platillo
         'tarjeta' | 'fila' | 'texto' | 'mosaico' | 'carrusel'

   Antes solo existía `catalogView` ('grid' | 'list'), así que las 16
   plantillas compartían un único esqueleto y se sentían primas entre sí:
   cambiaban de ropa, no de cuerpo. */

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon, ICON_PATHS } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Price, Tag, ctaClass } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { roleSize } from '@/lib/theme/resolve';
import { LAYOUT_MIN_COL, type CardStyle, type LayoutWidth } from '@/lib/theme/defaults';
import { isOpenNow, nextOpenLabel, hasAnyHours, todayWindowLabel, type WeeklyHours } from '@/lib/hours';
import { DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import { useLocale, useLocalized } from '@/lib/locale/context';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon' | 'name_en'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'> & {
  is_available?: boolean | null;
  unavailable_at?: string | null;
};

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isAutoRestored(p: ProdItem): boolean {
  if (p.is_available !== false) return false;
  if (!p.unavailable_at) return false;
  return Date.now() - new Date(p.unavailable_at).getTime() >= TWELVE_HOURS_MS;
}

function isUnavailable(p: ProdItem): boolean {
  if (p.is_available !== false) return false;
  return !isAutoRestored(p);
}

/** Precio base + suma de todos los priceDelta de grupos tipo combo (incluidos por defecto).
    Si un componente tiene variantes, se suma también la primera (es la que
    arranca preseleccionada en la hoja del producto — mismo precio inicial). */
function displayPrice(p: ProdItem): number {
  if (!p.options || p.options.length === 0) return p.price;
  const comboDelta = p.options
    .filter((g) => g.type === 'combo')
    .reduce(
      (sum, g) =>
        sum +
        g.choices.reduce(
          (s, c) => s + (c.priceDelta || 0) + (c.variants?.length ? Number(c.variants[0].priceDelta) || 0 : 0),
          0,
        ),
      0,
    );
  return p.price + comboDelta;
}

/** Normaliza para buscar sin acentos ni mayúsculas ("cafe" encuentra "Café"). */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ── Platillos destacados (jerarquía comercial) ───────────────
   Con config.featuredFavorites, los productos etiquetados como favorito/
   destacado se dibujan como tarjeta GRANDE de ancho completo (máx. 3 por
   vista, para que "destacado" siga significando algo). Las etiquetas son
   texto libre del dueño → se aceptan las variantes usuales. */
const FEATURED_TAG_KEYS = new Set([
  'fav', 'favorito', 'favorita', 'favorite',
  'destacado', 'destacada', 'estrella', 'star',
]);
const FEATURED_LIMIT = 3;

function isFeaturedTag(p: ProdItem): boolean {
  return (p.tags ?? []).some((t) => FEATURED_TAG_KEYS.has(fold(t.trim())));
}

/** Formas donde una tarjeta destacada tiene sentido. En 'texto' no hay arte que
    agrandar y en 'carrusel' todas las piezas miden lo mismo por definición. */
function supportsFeatured(card: CardStyle): boolean {
  return card === 'tarjeta' || card === 'fila' || card === 'mosaico';
}

/** Reloj que avanza cada `ms` para reevaluar los menús por franja sin recargar. */
function useNowTick(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** ¿La categoría está disponible ahora? Sin horario configurado = siempre. */
function catAvailableNow(c: CatItem, timezone: string, now: Date): boolean {
  if (!hasAnyHours(c.availability)) return true;
  return isOpenNow(c.availability, timezone, now);
}

/** Ícono para el patrón/categoría: el nombre SVG de la categoría o un default.
   Si el valor guardado no es un ícono SVG válido (p. ej. un emoji viejo), cae
   a 'utensils' para no renderizar un ícono vacío. */
function pickIcon(icon: string | null | undefined): string {
  return icon && ICON_PATHS[icon.trim()] ? icon.trim() : 'utensils';
}

/** Un bloque de platillos que se dibuja junto. Con navegación por chips hay uno
    solo (sin encabezado); con secciones/acordeón hay uno por categoría. */
interface Group {
  key: string;
  cat: CatItem | null;
  items: ProdItem[];
  /** Fuera de su horario: se puede mirar, no pedir. */
  locked: boolean;
}

interface CatalogProps {
  categories: CatItem[];
  products: ProdItem[];
  ordersEnabled: boolean;
  /** Zona horaria del restaurante para evaluar los menús por franja horaria. */
  timezone?: string;
  qtyOf: (productId: string) => number;
  onAdd: (product: ProdItem, sourceEl: HTMLElement) => void;
  onOpen: (product: ProdItem) => void;
}

export default function Catalog({
  categories, products, ordersEnabled, timezone = 'America/Guatemala', qtyOf, onAdd, onOpen,
}: CatalogProps) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const kickerT = useText('kicker', 'catalogKicker');
  const headingT = useText('poster', 'catalogHeading');
  const { locale, setLocale, available } = useLocale();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // `undefined` = el comensal aún no ha tocado el acordeón (abrimos la primera
  // sección por cortesía); `null` = lo cerró todo a propósito.
  const [openCat, setOpenCat] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [spySection, setSpySection] = useState<string | null>(null);

  const nav = config.catalogNav ?? 'chips';
  const card = config.cardStyle ?? 'tarjeta';
  const width = config.layoutWidth ?? 'movil';

  /** Traducción con fallback automático al español (ver lib/locale). */
  const localize = (base: string, translated?: string | null) =>
    (locale === 'en' && translated?.trim()) ? translated : base;

  // Reloj vivo: los menús por franja (desayuno/almuerzo/cena) se reevalúan
  // cada minuto, así un menú "abre" o "cierra" sin que el comensal recargue.
  const now = useNowTick(60_000);

  const catIcon = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, pickIcon(c.icon));
    return m;
  }, [categories]);

  // Disponibilidad por categoría según hora y zona horaria del restaurante.
  const catAvail = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of categories) m.set(c.id, catAvailableNow(c, timezone, now));
    return m;
  }, [categories, timezone, now]);

  // Busca en nombre, descripción y tags, ignorando acentos.
  const q = fold(query.trim());
  const searching = q.length > 0;
  const searched = useMemo(() => {
    if (!searching) return products;
    return products.filter((p) => fold([p.name, p.description ?? '', ...(p.tags ?? [])].join(' ')).includes(q));
  }, [products, q, searching]);

  /* ── Cómo se agrupan los platillos ──────────────────────────
     Buscar siempre aplana: quien escribe "coca" quiere resultados de TODA la
     carta, no de la sección que tuviera abierta. Fuera de la búsqueda manda
     la navegación de la plantilla.

     El carrusel es un caso aparte: una sola fila horizontal con la carta
     entera escondería casi todo tras un deslizamiento lateral, así que en la
     vista "Todo" se agrupa por categoría — una fila por categoría, que es
     justo el patrón de las apps de delivery. */
  const groupByCategory =
    !searching && (
      nav === 'secciones' || nav === 'acordeon' ||
      (nav === 'chips' && card === 'carrusel' && activeCat === null)
    );

  // Modo 'portadas' sin categoría elegida: se muestra el selector, no platillos.
  const showCategoryCovers = nav === 'portadas' && activeCat === null && !searching;

  const groups: Group[] = useMemo(() => {
    if (searching) {
      return [{ key: '_search', cat: null, items: searched, locked: false }];
    }

    if (groupByCategory) {
      // Secciones/acordeón muestran la carta ENTERA: las categorías fuera de
      // horario no se esconden, se marcan y se mandan al final. Esconderlas
      // rompería la promesa de "aquí está todo el menú de corrido".
      const withItems = categories
        .map((c) => ({
          key: c.id,
          cat: c,
          items: searched.filter((p) => p.category_id === c.id),
          locked: catAvail.get(c.id) === false,
        }))
        .filter((g) => g.items.length > 0);
      const isSection = nav === 'secciones' || nav === 'acordeon';
      return isSection
        ? [...withItems.filter((g) => !g.locked), ...withItems.filter((g) => g.locked)]
        : withItems.filter((g) => !g.locked);
    }

    // Chips / portadas: una sola tanda, filtrada por la categoría activa.
    const items = searched.filter((p) => {
      if (activeCat !== null) return p.category_id === activeCat;
      // Vista "Todos": se ocultan los menús fuera de horario (siguen accesibles
      // tocando su chip o la franja "Disponibles más tarde").
      return !(p.category_id != null && catAvail.get(p.category_id) === false);
    });
    return [{
      key: activeCat ?? '_all',
      cat: activeCat !== null ? categories.find((c) => c.id === activeCat) ?? null : null,
      items,
      locked: activeCat !== null && catAvail.get(activeCat) === false,
    }];
  }, [searching, searched, groupByCategory, categories, catAvail, activeCat, nav]);

  // Menús programados que ahora están fuera de horario. Solo se listan aparte
  // en chips/portadas; en secciones/acordeón ya salen (marcados) dentro de la carta.
  const upcoming = (nav === 'chips' || nav === 'portadas')
    ? categories.filter((c) => hasAnyHours(c.availability) && catAvail.get(c.id) === false)
    : [];

  const sectionKeys = groups.map((g) => g.key).join('|');
  const openCatId = openCat === undefined ? (groups[0]?.key ?? null) : openCat;

  /* Índice pegajoso: resalta la sección que se está leyendo. Sin esto el índice
     es un menú de saltos mudo — no dice dónde estás, que es la mitad de su
     utilidad en una carta larga. */
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const visibleIds = useRef(new Set<string>());
  useEffect(() => {
    if (nav !== 'secciones') return;
    const keys = sectionKeys ? sectionKeys.split('|') : [];
    const els = keys.map((k) => sectionEls.current.get(k)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    visibleIds.current.clear();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.cat;
          if (!id) continue;
          if (e.isIntersecting) visibleIds.current.add(id);
          else visibleIds.current.delete(id);
        }
        // La primera del orden de la carta que siga a la vista: el observador
        // solo entrega las que CAMBIARON, así que el estado vive en el ref.
        setSpySection(keys.find((k) => visibleIds.current.has(k)) ?? null);
      },
      { rootMargin: '-88px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [nav, sectionKeys]);

  function goToSection(id: string) {
    sectionEls.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const kicker = content.catalog.kicker || [config.brandName, config.zone].filter(Boolean).join(' · ');

  // Ids que se dibujan como tarjeta destacada (primeros N favoritos disponibles
  // de toda la vista, no por sección: "destacado" debe seguir siendo escaso).
  const featuredIds = new Set<string>();
  if (config.featuredFavorites && supportsFeatured(card)) {
    for (const g of groups) {
      for (const p of g.items) {
        if (featuredIds.size >= FEATURED_LIMIT) break;
        if (isFeaturedTag(p) && !isUnavailable(p)) featuredIds.add(p.id);
      }
    }
  }

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

  const itemsProps = {
    card, width, featuredIds, catIcon, ordersEnabled, qtyOf, onAdd, onOpen,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div className="t-kicker" style={{ ...kickerT.vars, fontSize: 12 * kickerT.size }}>{kicker}</div>
          <h2 className="t-poster" style={{ ...headingT.vars, fontSize: `calc(${headingT.size} * clamp(34px, 11vw, 44px))`, marginTop: 2 }}>
            {content.catalog.heading}
          </h2>
        </div>
        {available.length > 1 && (
          <div className="glass-quiet" style={{ display: 'inline-flex', padding: 3, borderRadius: 999, flexShrink: 0, marginTop: 4 }}>
            {available.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className="press"
                aria-pressed={locale === l}
                // "ES"/"EN" a secas no dice nada a quien no ve el contexto.
                aria-label={l === 'en' ? 'Ver el menú en inglés' : 'Ver el menú en español'}
                style={{
                  padding: '8px 14px', minHeight: 40, borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em',
                  background: locale === l ? 'var(--u-text)' : 'transparent',
                  color: locale === l ? 'var(--brand-bg)' : 'var(--u-text-3)',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Búsqueda */}
      {config.showSearch && (
        <div style={{ position: 'relative', marginTop: 14 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}>
            <Icon name="search" size={17} />
          </span>
          {/* Dos cosas aquí:
             · El marcador de posición no es una etiqueta: desaparece al
               escribir y no lo anuncia ninguna lectura asistida.
             · fontSize 16 no es capricho. Safari en iPhone hace zoom
               automático al enfocar un campo con letra menor de 16px, y el
               menú se quedaba ampliado y descuadrado en cuanto el comensal
               tocaba el buscador. */}
          <label htmlFor="menu-buscar" className="sr-only">Buscar en el menú</label>
          <input
            id="menu-buscar"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={content.catalog.searchPlaceholder}
            className="glass-quiet ct-body"
            style={{ width: '100%', padding: '13px 14px 13px 42px', minHeight: 46, borderRadius: 13, border: 'none', color: 'var(--u-text)', fontSize: 16, outline: 'none', background: 'var(--surface-2)' }}
          />
        </div>
      )}

      {/* ── Navegación de la carta ── */}

      {/* Píldoras: filtro de una categoría a la vez. */}
      {nav === 'chips' && !searching && (
        <div className="u-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 6px' }}>
          <CategoryChip label={content.catalog.allLabel} icon={config.showCategoryIcons ? 'grid' : undefined} active={activeCat === null} onClick={() => setActiveCat(null)} />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={localize(c.name, c.name_en)}
              icon={config.showCategoryIcons ? catIcon.get(c.id) : undefined}
              active={activeCat === c.id}
              unavailable={catAvail.get(c.id) === false}
              onClick={() => setActiveCat(c.id)}
            />
          ))}
        </div>
      )}

      {/* Índice pegajoso: la carta se lee de corrido y este se queda arriba. */}
      {nav === 'secciones' && !searching && groups.length > 1 && (
        <div
          className="u-noscroll"
          style={{
            position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 8, overflowX: 'auto',
            // Se sale del padding del <main> para que el velo difuminado cubra
            // el ancho completo y las píldoras no se corten contra el borde.
            padding: '12px 16px 10px', margin: '4px -16px 0',
            background: 'color-mix(in srgb, var(--brand-bg) 88%, transparent)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {groups.map((g) => (
            <CategoryChip
              key={g.key}
              label={localize(g.cat?.name ?? '', g.cat?.name_en)}
              icon={config.showCategoryIcons ? catIcon.get(g.key) : undefined}
              active={spySection === g.key}
              unavailable={g.locked}
              onClick={() => goToSection(g.key)}
            />
          ))}
        </div>
      )}

      {/* Volver del menú de una categoría al selector de portadas. */}
      {nav === 'portadas' && activeCat !== null && !searching && (
        <button
          onClick={() => setActiveCat(null)}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14,
            padding: '10px 15px', minHeight: 44, borderRadius: 99, cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--u-hair)', color: 'var(--u-text-2)',
            fontWeight: 600, fontSize: 13.5,
          }}
        >
          <Icon name="chevronLeft" size={15} /> {content.catalog.allLabel}
        </button>
      )}

      {/* ── Contenido ── */}

      {showCategoryCovers ? (
        <CategoryCovers
          categories={categories}
          products={products}
          catIcon={catIcon}
          catAvail={catAvail}
          width={width}
          localize={localize}
          onPick={(id) => setActiveCat(id)}
        />
      ) : totalItems === 0 ? (
        /* Antes: un único texto gris igual para todos los casos. Quien escribía
           "cafe con lehce" veía "no hay platillos" y no ataba cabos con que su
           propia búsqueda era la que estaba filtrando — se iba creyendo que el
           restaurante no tenía nada. Ahora se dice qué se buscó y se ofrece la
           salida en un botón, sin obligar a borrar el texto a mano. */
        <div role="status" style={{ textAlign: 'center', padding: '46px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Icon name={query.trim() ? 'search' : 'utensils'} size={26} style={{ color: 'var(--u-text-4)' }} />
          {query.trim() ? (
            <>
              <p className="t-mute" style={{ fontSize: 14.5, margin: 0, lineHeight: 1.5 }}>
                No encontramos nada con <strong style={{ color: 'var(--u-text-2)' }}>“{query.trim()}”</strong>.
              </p>
              <p className="t-mute" style={{ fontSize: 12.5, margin: 0 }}>Revisa cómo se escribe o mira el menú completo.</p>
              <button
                onClick={() => { setQuery(''); setActiveCat(null); }}
                className={`press ${ctaClass(config.ctaStyle)}`}
                style={{ marginTop: 4, padding: '12px 20px', minHeight: 44, borderRadius: 99, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
              >
                Ver todo el menú
              </button>
            </>
          ) : (
            <p className="t-mute" style={{ fontSize: 14, margin: 0 }}>{content.catalog.empty}</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: nav === 'acordeon' ? 8 : 26, marginTop: groupByCategory ? 16 : 0 }}>
          {groups.map((g) => {
            const headed = groupByCategory && g.cat !== null;
            const collapsed = nav === 'acordeon' && openCatId !== g.key;
            return (
              <section
                key={g.key}
                data-cat={g.key}
                ref={(el) => {
                  if (el) sectionEls.current.set(g.key, el);
                  else sectionEls.current.delete(g.key);
                }}
                style={{ scrollMarginTop: nav === 'secciones' ? 76 : 12 }}
              >
                {headed && (
                  <SectionHeader
                    label={localize(g.cat!.name, g.cat!.name_en)}
                    icon={config.showCategoryIcons ? catIcon.get(g.key) : undefined}
                    count={g.items.length}
                    locked={g.locked}
                    collapsible={nav === 'acordeon'}
                    open={!collapsed}
                    onToggle={() => setOpenCat(collapsed ? g.key : null)}
                  />
                )}
                {!collapsed && (
                  <>
                    {g.locked && g.cat && (
                      <LockedNote cat={g.cat} timezone={timezone} now={now} localize={localize} />
                    )}
                    <Items {...itemsProps} items={g.items} locked={g.locked} />
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Disponibles más tarde — solo en la vista "Todos" (sin búsqueda) */}
      {activeCat === null && !searching && upcoming.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div className="t-kicker" style={{ fontSize: 10.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={13} /> Disponibles más tarde
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map((c) => {
              const reopen = nextOpenLabel(c.availability, timezone, now);
              const win = todayWindowLabel(c.availability, timezone, now);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className="press glass-quiet"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    padding: '11px 14px', borderRadius: 14, border: '1px solid var(--u-hair)',
                    background: 'var(--surface-2)', color: 'var(--u-text)', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--u-hair)', color: 'var(--u-text-2)' }}>
                    <Icon name={config.showCategoryIcons ? (catIcon.get(c.id) ?? 'utensils') : 'clock'} size={17} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{localize(c.name, c.name_en)}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                      {reopen ? `Se sirve ${reopen}` : win ? `Horario: ${win}` : 'Fuera de horario'}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Despachador de forma ─────────────────────────────────────
   Un solo lugar decide qué contenedor y qué pieza dibuja cada platillo, para
   que añadir una forma nueva no obligue a tocar cada modo de navegación. */

interface ItemsProps {
  items: ProdItem[];
  locked: boolean;
  card: CardStyle;
  width: LayoutWidth;
  featuredIds: Set<string>;
  catIcon: Map<string, string>;
  ordersEnabled: boolean;
  qtyOf: (id: string) => number;
  onAdd: (p: ProdItem, el: HTMLElement) => void;
  onOpen: (p: ProdItem) => void;
}

function Items({ items, locked, card, width, featuredIds, catIcon, ordersEnabled, qtyOf, onAdd, onOpen }: ItemsProps) {
  const config = useThemeConfig();
  const anim = config.animations;

  const iconFor = (p: ProdItem) => p.icon || catIcon.get(p.category_id ?? '') || 'utensils';
  const common = (p: ProdItem) => ({
    p, icon: iconFor(p), qty: qtyOf(p.id), ordersEnabled, forceUnavailable: locked, onAdd, onOpen,
  });

  /* Columnas: en móvil manda la elección del dueño (2 o 3). En lienzos anchos
     se reparte por ancho disponible — con 2 columnas fijas en una pantalla de
     escritorio cada tarjeta acabaría midiendo medio metro. */
  const wide = width !== 'movil';
  const gridCols = wide
    ? `repeat(auto-fill, minmax(${LAYOUT_MIN_COL[width]}px, 1fr))`
    : `repeat(${config.catalogColumns}, 1fr)`;

  const fade = (i: number) => ({
    className: anim ? 'anim-fade-up' : '',
    style: { animationDelay: anim ? `${Math.min(i, 8) * 35}ms` : undefined },
  });

  if (card === 'texto') {
    // Carta impresa: sin una sola imagen. El contraste entre nombre y precio lo
    // hace la línea de puntos, no una foto.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {items.map((p, i) => (
          <div key={p.id} {...fade(i)}>
            <TextRow {...common(p)} />
          </div>
        ))}
      </div>
    );
  }

  if (card === 'carrusel') {
    const tileW = width === 'revista' ? 196 : width === 'ancho' ? 176 : 148;
    return (
      <div
        className="u-noscroll"
        style={{
          display: 'flex', gap: 12, overflowX: 'auto', marginTop: 10,
          // El margen negativo deja que las piezas se deslicen hasta el borde
          // de la pantalla en vez de cortarse contra el padding del <main>.
          padding: '2px 16px 6px', marginInline: -16, scrollSnapType: 'x proximity',
        }}
      >
        {items.map((p, i) => (
          <div key={p.id} {...fade(i)} style={{ ...fade(i).style, width: tileW, flexShrink: 0, scrollSnapAlign: 'start' }}>
            <ProductTile {...common(p)} />
          </div>
        ))}
      </div>
    );
  }

  if (card === 'mosaico') {
    // Multi-columna real: las piezas tienen alturas distintas y encajan como
    // una revista. `breakInside: avoid` impide que una tarjeta se parta.
    const n = width === 'revista' ? 4 : width === 'ancho' ? 3 : config.catalogColumns;
    return (
      <div style={{ columnCount: n, columnGap: 12, marginTop: 12 }}>
        {items.map((p, i) => (
          <div key={p.id} {...fade(i)} style={{ ...fade(i).style, breakInside: 'avoid', marginBottom: 12 }}>
            {featuredIds.has(p.id) ? <FeaturedTile {...common(p)} /> : <MosaicTile {...common(p)} />}
          </div>
        ))}
      </div>
    );
  }

  if (card === 'fila') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {items.map((p, i) => (
          <div key={p.id} {...fade(i)}>
            {featuredIds.has(p.id) ? <FeaturedTile {...common(p)} /> : <ProductRow {...common(p)} />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, marginTop: 12 }}>
      {items.map((p, i) => {
        const featured = featuredIds.has(p.id);
        return (
          <div key={p.id} {...fade(i)} style={{ ...fade(i).style, gridColumn: featured ? '1 / -1' : undefined }}>
            {featured ? <FeaturedTile {...common(p)} /> : <ProductTile {...common(p)} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Piezas de navegación ─────────────────────────────────── */

function CategoryChip({ label, icon, active, unavailable = false, onClick }: { label: string; icon?: string; active: boolean; unavailable?: boolean; onClick: () => void }) {
  // Fuera de horario (y no seleccionado): se atenúa y muestra un reloj, pero
  // sigue tocable para que el comensal pueda ver ese menú.
  const dim = unavailable && !active;
  return (
    <button
      onClick={onClick}
      className="press"
      // aria-pressed: sin esto, quien navega con lectura asistida no sabe qué
      // categoría está filtrando — el resaltado es solo visual.
      aria-pressed={active}
      title={unavailable ? 'Disponible en otro horario' : undefined}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '11px 16px', minHeight: 44, borderRadius: 99, cursor: 'pointer',
        background: active ? 'var(--u-text)' : 'var(--surface-2)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
        border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
        fontWeight: 600, fontSize: 13.5, opacity: dim ? 0.55 : 1,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {dim ? <Icon name="clock" size={14} /> : icon && <Icon name={icon} size={15} />}
      {label}
      {dim && <span className="sr-only"> — disponible en otro horario</span>}
    </button>
  );
}

/** Encabezado de sección. En acordeón es el botón que pliega y despliega; en
    secciones es un título con un filete que separa la carta a la vista. */
function SectionHeader({
  label, icon, count, locked, collapsible, open, onToggle,
}: {
  label: string; icon?: string; count: number; locked: boolean;
  collapsible: boolean; open: boolean; onToggle: () => void;
}) {
  const t = useText('poster', 'catalogSection');
  const inner = (
    <>
      {icon && <Icon name={icon} size={17} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />}
      <span className="t-poster" style={{ ...t.vars, fontSize: 20 * t.size, flex: 1, minWidth: 0, textAlign: 'left' }}>
        {label}
      </span>
      {locked && <Icon name="clock" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
      <span className="t-mono" style={{ fontSize: 11.5, color: 'var(--u-text-4)', flexShrink: 0 }}>{count}</span>
      {collapsible && (
        <Icon
          name="chevronDown"
          size={17}
          style={{ color: 'var(--u-text-3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 180ms' }}
        />
      )}
    </>
  );

  if (collapsible) {
    return (
      <button
        onClick={onToggle}
        className="press"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '13px 15px', minHeight: 52, borderRadius: 'var(--radius-lg)', cursor: 'pointer',
          background: 'var(--surface-2)', border: '1px solid var(--u-hair)', color: 'var(--u-text)',
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--u-hair)' }}>
      {inner}
    </div>
  );
}

/** Aviso de categoría fuera de su horario: se puede mirar, no pedir. */
function LockedNote({
  cat, timezone, now, localize,
}: {
  cat: CatItem; timezone: string; now: Date;
  localize: (base: string, translated?: string | null) => string;
}) {
  const reopen = nextOpenLabel(cat.availability, timezone, now);
  const win = todayWindowLabel(cat.availability, timezone, now);
  return (
    <div
      role="status"
      style={{
        display: 'flex', gap: 10, alignItems: 'center', marginTop: 10,
        background: 'var(--surface-2)', border: '1px solid var(--u-hair)',
        borderRadius: 14, padding: '11px 14px',
      }}
    >
      <span style={{ color: 'var(--u-text-3)', flexShrink: 0 }}><Icon name="clock" size={17} /></span>
      <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
        <strong style={{ color: 'var(--u-text)' }}>{localize(cat.name, cat.name_en)}</strong>{' '}
        {reopen ? `se sirve ${reopen}.` : win ? `se sirve de ${win}.` : 'no está disponible ahora.'}{' '}
        Puedes verlo, pero aún no pedirlo.
      </div>
    </div>
  );
}

/** Selector de categorías a tarjeta grande (navegación 'portadas'): el menú
    empieza eligiendo sección, como en una app de delivery, en vez de soltar
    toda la carta de golpe. */
function CategoryCovers({
  categories, products, catIcon, catAvail, width, localize, onPick,
}: {
  categories: CatItem[];
  products: ProdItem[];
  catIcon: Map<string, string>;
  catAvail: Map<string, boolean>;
  width: LayoutWidth;
  localize: (base: string, translated?: string | null) => string;
  onPick: (id: string) => void;
}) {
  const config = useThemeConfig();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (!p.category_id) continue;
      m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    }
    return m;
  }, [products]);

  const shown = categories.filter((c) => (counts.get(c.id) ?? 0) > 0);
  const cols = width === 'revista' ? 3 : width === 'ancho' ? 2 : 1;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginTop: 18 }}>
      {shown.map((c, i) => {
        const locked = catAvail.get(c.id) === false;
        const n = counts.get(c.id) ?? 0;
        return (
          <Glass
            key={c.id}
            interactive
            onClick={() => onPick(c.id)}
            ariaLabel={`Ver ${localize(c.name, c.name_en)}`}
            className={config.animations ? 'anim-fade-up' : ''}
            style={{
              borderRadius: 20, overflow: 'hidden', cursor: 'pointer', opacity: locked ? 0.75 : 1,
              animationDelay: config.animations ? `${Math.min(i, 8) * 45}ms` : undefined,
            }}
          >
            <div style={{ position: 'relative', aspectRatio: cols === 1 ? '2.6' : '1.6', background: 'var(--surface-1)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
                <BrandPattern icon={catIcon.get(c.id) ?? 'utensils'} seed={seedFromString(c.id)} iconScale={1.5} />
              </div>
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0) 80%)' }} />
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-poster" style={{ fontSize: 23, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.05 }}>
                    {localize(c.name, c.name_en)}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {locked ? 'Disponible en otro horario' : `${n} ${n === 1 ? 'platillo' : 'platillos'}`}
                  </div>
                </div>
                <span style={{ width: 38, height: 38, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', color: '#fff' }}>
                  <Icon name={locked ? 'clock' : 'chevronRight'} size={18} />
                </span>
              </div>
            </div>
          </Glass>
        );
      })}
    </div>
  );
}

/* ── Piezas de platillo ───────────────────────────────────── */

/** Arte del producto: foto o BrandPattern según config.productArt. */
function ProductArt({ p, icon, scale = 1 }: { p: ProdItem; icon: string; scale?: number }) {
  const config = useThemeConfig();
  const usePhoto = p.image_url && config.productArt !== 'pattern';
  if (usePhoto) {
    return <Image src={p.image_url!} alt={p.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 440px) 50vw, 220px" />;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
      <BrandPattern icon={icon} seed={seedFromString(p.id)} iconScale={scale} />
    </div>
  );
}

/**
 * Botón de agregar al carrito.
 *
 * Medía 32×32 px, y es la acción principal de todo el menú. En un teléfono
 * —que es donde se usa esto, escaneando un QR en la mesa— eso queda por debajo
 * del mínimo recomendado de 44×44 (WCAG 2.5.5; Apple pide 44pt y Android 48dp).
 * Con dedos grandes, prisa o pulso poco firme se falla y se abre la ficha del
 * producto en vez de agregarlo, que es exactamente el tropiezo que nadie
 * reporta pero que hace abandonar el pedido.
 *
 * 44×44 reales. El icono no crece: solo el área que recibe el toque.
 *
 * `quiet` lo usa la forma 'texto': en una carta impresa un botón relleno por
 * línea pesa demasiado y rompe la mancha tipográfica. El área táctil sigue
 * siendo la misma — lo que baja es el peso visual, no el tamaño del blanco.
 */
function AddControl({ p, qty, onAdd, quiet = false }: { p: ProdItem; qty: number; onAdd: (p: ProdItem, el: HTMLElement) => void; quiet?: boolean }) {
  const config = useThemeConfig();
  if (qty > 0) {
    return (
      <span
        className="t-mono"
        // role="status" para que al agregar se anuncie "2 en tu pedido" en vez
        // de cambiar en silencio.
        role="status"
        aria-label={`${qty} ${qty === 1 ? 'unidad' : 'unidades'} de ${p.name} en tu pedido`}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 44, minHeight: 44, padding: '5px 12px', borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 700, fontSize: 13 }}
      >
        <Icon name="check" size={12} strokeWidth={3} />{qty}
      </span>
    );
  }
  if (quiet) {
    return (
      <button
        className="press"
        onClick={(e) => { e.stopPropagation(); onAdd(p, e.currentTarget); }}
        style={{
          width: 44, height: 44, borderRadius: 99, cursor: 'pointer', display: 'grid', placeItems: 'center',
          flexShrink: 0, background: 'transparent', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-2)',
        }}
        aria-label={`Agregar ${p.name} a tu pedido`}
      >
        <Icon name="plus" size={17} strokeWidth={2.2} />
      </button>
    );
  }
  return (
    <button
      // Sigue el estilo de CTA elegido por el restaurante (antes btn-white fijo,
      // que se lavaba con paletas claras e ignoraba la opción del editor).
      className={`press ${ctaClass(config.ctaStyle)}`}
      onClick={(e) => { e.stopPropagation(); onAdd(p, e.currentTarget); }}
      style={{ width: 44, height: 44, borderRadius: 13, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
      aria-label={`Agregar ${p.name} a tu pedido`}
    >
      <Icon name="plus" size={19} strokeWidth={2.4} />
    </button>
  );
}

/** Fila compacta de íconos de alérgenos/dietas — no ocultable (info de seguridad
    alimentaria), a diferencia de config.showTags que sí controla las etiquetas
    de mercadeo libres del dueño. */
function DietaryBadges({ keys, size = 13 }: { keys: string[] | null | undefined; size?: number }) {
  const { locale } = useLocale();
  if (!keys || keys.length === 0) return null;
  const known = keys.map((k) => DIETARY_TAG_MAP[k]).filter(Boolean);
  if (known.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {known.map((t) => {
        const label = locale === 'en' ? t.labelEn : t.label;
        return (
          <span key={t.key} title={label} aria-label={label} style={{ fontSize: size, lineHeight: 1 }}>
            {t.icon}
          </span>
        );
      })}
    </div>
  );
}

interface TileProps {
  p: ProdItem;
  icon: string;
  qty: number;
  ordersEnabled: boolean;
  forceUnavailable?: boolean;
  onAdd: (p: ProdItem, el: HTMLElement) => void;
  onOpen: (p: ProdItem) => void;
}

function ProductTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass
      interactive={!unavail}
      onClick={() => !unavail && onOpen(p)}
      ariaLabel={`Ver ${name}`}
      style={{ borderRadius: 18, overflow: 'hidden', cursor: unavail ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', height: '100%', opacity: unavail ? 0.72 : 1 }}
    >
      <div style={{ position: 'relative', aspectRatio: '1.25', background: 'var(--surface-1)', overflow: 'hidden' }}>
        <ProductArt p={p} icon={icon} />
        {config.showTags && p.tags && p.tags.length > 0 && !unavail && (
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {p.tags.slice(0, 2).map((t) => <Tag key={t} label={t} small />)}
          </div>
        )}
        {unavail && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'var(--badge-bg)', color: 'var(--badge-text)', letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
              No disponible
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div className="ct-product-name" style={{ fontSize: 14.5 * roleSize(config, 'productName'), flex: 1, textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}>{name}</div>
        <DietaryBadges keys={p.dietary_tags} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Price amount={displayPrice(p)} size={15} muted={unavail} />
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </Glass>
  );
}

/* Pieza de mosaico: como la tarjeta, pero con el arte de altura variable para
   que la columna quede desigual a propósito (el ritmo editorial de una
   revista). La proporción sale del id del producto, así que es estable entre
   renders — si fuera aleatoria, la carta "bailaría" en cada actualización. */
const MOSAIC_RATIOS = [1.35, 0.86, 1.05, 0.72];

function MosaicTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  const ratio = MOSAIC_RATIOS[seedFromString(p.id) % MOSAIC_RATIOS.length];
  return (
    <Glass
      interactive={!unavail}
      onClick={() => !unavail && onOpen(p)}
      ariaLabel={`Ver ${name}`}
      style={{ borderRadius: 18, overflow: 'hidden', cursor: unavail ? 'default' : 'pointer', opacity: unavail ? 0.72 : 1 }}
    >
      <div style={{ position: 'relative', aspectRatio: String(ratio), background: 'var(--surface-1)', overflow: 'hidden' }}>
        <ProductArt p={p} icon={icon} scale={1.15} />
        {config.showTags && p.tags?.[0] && !unavail && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}><Tag label={p.tags[0]} small /></div>
        )}
        {unavail && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'var(--badge-bg)', color: 'var(--badge-text)', letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
              No disponible
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="ct-product-name" style={{ fontSize: 14.5 * roleSize(config, 'productName'), textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}>{name}</div>
        {description && (
          <div className="line-clamp-2 ct-product-desc" style={{ fontSize: 12 * roleSize(config, 'productDesc') }}>{description}</div>
        )}
        <DietaryBadges keys={p.dietary_tags} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Price amount={displayPrice(p)} size={15} muted={unavail} />
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </Glass>
  );
}

/* Tarjeta destacada: ancho completo, arte grande y texto sobre un degradado
   (blanco sobre velo oscuro = legible con foto o patrón en cualquier paleta). */
function FeaturedTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass
      interactive={!unavail}
      onClick={() => !unavail && onOpen(p)}
      ariaLabel={`Ver ${name}`}
      style={{ borderRadius: 22, overflow: 'hidden', cursor: unavail ? 'default' : 'pointer', opacity: unavail ? 0.72 : 1 }}
    >
      <div style={{ position: 'relative', aspectRatio: '1.85', background: 'var(--surface-1)', overflow: 'hidden' }}>
        <ProductArt p={p} icon={icon} scale={1.35} />
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.24) 46%, rgba(0,0,0,0) 72%)' }}
        />
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <span
            className="ct-tag"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 999,
              background: 'var(--brand-accent)', color: 'var(--brand-on-accent)',
              fontSize: 10.5 * roleSize(config, 'tag'), fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}
          >
            <Icon name="star" size={11} /> {content.tags.fav}
          </span>
        </div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="ct-product-name"
              style={{ fontSize: 19 * roleSize(config, 'productName'), color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', lineHeight: 1.15, textDecoration: unavail ? 'line-through' : 'none' }}
            >
              {name}
            </div>
            {description && (
              <div className="line-clamp-2" style={{ fontSize: 12 * roleSize(config, 'productDesc'), color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 1.4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {description}
              </div>
            )}
            <Price amount={displayPrice(p)} size={17} style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', marginTop: 5, display: 'inline-block' }} />
          </div>
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </Glass>
  );
}

function ProductRow({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass interactive={!unavail} onClick={() => !unavail && onOpen(p)} ariaLabel={`Ver ${name}`} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 13, alignItems: 'center', cursor: unavail ? 'default' : 'pointer', opacity: unavail ? 0.72 : 1 }}>
      <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-1)', position: 'relative' }}>
        <ProductArt p={p} icon={icon} scale={0.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="ct-product-name" style={{ fontSize: 15.5 * roleSize(config, 'productName'), textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}>{name}</div>
          {unavail && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--surface-3)', color: 'var(--u-text-4)', border: '1px solid var(--u-hair)' }}>No disponible</span>}
          {config.showTags && !unavail && p.tags?.[0] && <Tag label={p.tags[0]} small />}
        </div>
        {description && (
          <div className="line-clamp-2 ct-product-desc" style={{ fontSize: 12 * roleSize(config, 'productDesc') }}>{description}</div>
        )}
        <DietaryBadges keys={p.dietary_tags} size={12} />
        <Price amount={displayPrice(p)} size={15} muted={unavail} />
      </div>
      {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
    </Glass>
  );
}

/* Carta impresa: nombre · línea de puntos · precio, sin ninguna imagen.
   Es la forma que piden bistrós, bares de vinos y cafés de especialidad — los
   que NO quieren fotos de su comida y a los que hasta ahora la plataforma solo
   sabía ofrecerles rejillas de tarjetas. */
function TextRow({ p, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <div
      role={unavail ? undefined : 'button'}
      tabIndex={unavail ? undefined : 0}
      aria-label={unavail ? undefined : `Ver ${name}`}
      onClick={() => !unavail && onOpen(p)}
      onKeyDown={(e) => {
        if (unavail) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p); }
      }}
      className="press"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 2px', borderBottom: '1px solid var(--u-hair)',
        cursor: unavail ? 'default' : 'pointer', opacity: unavail ? 0.62 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span
            className="ct-product-name"
            style={{ fontSize: 16 * roleSize(config, 'productName'), textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}
          >
            {name}
          </span>
          {/* El filete punteado es lo que hace legible el par nombre→precio sin
              una foto de por medio: el ojo lo sigue de un lado al otro. */}
          <span aria-hidden style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted var(--u-hair-2)' }} />
          <Price amount={displayPrice(p)} size={15} muted={unavail} />
        </div>
        {description && (
          <div className="ct-product-desc" style={{ fontSize: 12.5 * roleSize(config, 'productDesc'), marginTop: 4, maxWidth: '46em' }}>
            {description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: description ? 6 : 5, flexWrap: 'wrap' }}>
          <DietaryBadges keys={p.dietary_tags} size={12} />
          {config.showTags && !unavail && p.tags?.[0] && <Tag label={p.tags[0]} small />}
          {unavail && (
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--surface-3)', color: 'var(--u-text-4)', border: '1px solid var(--u-hair)' }}>
              No disponible
            </span>
          )}
        </div>
      </div>
      {ordersEnabled && !unavail && (
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <AddControl p={p} qty={qty} onAdd={onAdd} quiet />
        </div>
      )}
    </div>
  );
}
