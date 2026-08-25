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
import { Icon, ICON_PATHS } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { MenuSurface, Price, Tag, ctaClass } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { roleSize } from '@/lib/theme/resolve';
import { LAYOUT_MIN_COL, type CardStyle, type LayoutWidth } from '@/lib/theme/defaults';
import { MOSAIC_MAX_TILE, canvasComposition, mosaicColumns, mosaicLayoutColumns, textColumns } from '@/lib/theme/canvas';
import { useScreenTier } from '@/lib/theme/use-screen-tier';
import { isOpenNow, nextOpenLabel, hasAnyHours, todayWindowLabel, type WeeklyHours } from '@/lib/hours';
import { DIETARY_TAG_MAP } from '@/lib/dietary-tags';
import { useLocale, useLocalized } from '@/lib/locale/context';
import { isUnavailable } from '@/lib/product-availability';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon' | 'name_en'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'> & {
  is_available?: boolean | null;
  unavailable_at?: string | null;
};

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
  const canvas = config.layoutWidth ?? 'movil';
  // El ANCHO del lienzo lo pone el CSS (`--menu-max`); aquí solo se decide la
  // COMPOSICIÓN, que es lo que no cabe en una media query. Ver lib/theme/canvas.ts.
  const tier = useScreenTier();
  const width = canvasComposition(canvas, tier);

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

  /* Medido en un teléfono de 375×812: el hero decía «Azúcar Negra», y 12 px
     más abajo este rótulo repetía «AZÚCAR NEGRA · EL MENÚ» — justo debajo de
     un botón que acababa de decir «Ver el menú». Tres veces la misma palabra
     antes del primer platillo. Es la misma deuda que el panel saldó el 22-08
     al quitar los títulos que reescribían lo que ya decía la barra.

     La regla respeta al dueño: si él ESCRIBIÓ su rótulo, se pinta siempre —
     puede decir algo que la portada no dice («Cocina de mercado, zona 10»).
     Solo se calla el rótulo AUTOMÁTICO (nombre · zona) y solo cuando hay una
     portada que ya presentó la marca. Sin portada ('none') este rótulo es la
     única identidad de la página y se queda. */
  const autoKicker = [config.brandName, config.zone].filter(Boolean).join(' · ');
  const brandAlreadyShown = config.portadaVariant !== 'none';
  const kicker = content.catalog.kicker || (brandAlreadyShown ? '' : autoKicker);

  /* En tablet/escritorio el buscador sube a la misma línea del título: un campo
     de 1.000 px de ancho bajo el encabezado es lo que delata a un menú pensado
     solo para el teléfono y estirado a la fuerza. */
  const wide = width !== 'movil';

  const searchBox = config.showSearch ? (
    <div style={{ position: 'relative', width: '100%', maxWidth: wide ? 320 : undefined }}>
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
        style={{ width: '100%', padding: '13px 14px 13px 42px', minHeight: 46, borderRadius: 'var(--m-r-md)', border: 'none', color: 'var(--u-text)', fontSize: 'var(--m-fs-lg)', outline: 'none', background: 'var(--surface-2)' }}
      />
    </div>
  ) : null;

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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {kicker && (
            <div className="t-kicker" style={{ ...kickerT.vars, fontSize: `calc(var(--m-fs-xs) * ${kickerT.size})` }}>{kicker}</div>
          )}
          {/* El titular crece con el lienzo: 44 px que mandan en un teléfono se
              quedan cortos en una página de revista de 1.120 px. */}
          <h2 className="t-poster" style={{ ...headingT.vars, fontSize: `calc(${headingT.size} * clamp(34px, 11vw, ${width === 'revista' ? 64 : width === 'ancho' ? 52 : 44}px))`, marginTop: 2 }}>
            {content.catalog.heading}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flex: wide ? '1 1 260px' : '0 0 auto' }}>
          {wide && searchBox}
          {available.length > 1 && (
            <div className="glass-quiet" style={{ display: 'inline-flex', padding: 3, borderRadius: 'var(--m-r-pill)', flexShrink: 0 }}>
              {available.map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className="press"
                  aria-pressed={locale === l}
                  // "ES"/"EN" a secas no dice nada a quien no ve el contexto.
                  aria-label={l === 'en' ? 'Ver el menú en inglés' : 'Ver el menú en español'}
                  style={{
                    padding: '0 16px', minHeight: 'var(--m-tap)', minWidth: 'var(--m-tap)', borderRadius: 'var(--m-r-pill)', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--m-fs-sm)', fontWeight: 700, letterSpacing: '0.02em',
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
      </div>

      {/* Búsqueda (en lienzos anchos ya viaja en el encabezado) */}
      {!wide && searchBox && <div style={{ marginTop: 14 }}>{searchBox}</div>}

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

      {/* Índice pegajoso: la carta se lee de corrido y este se queda arriba.
          El velo difuminado se sale hasta el borde de la ventana (menu-bleed):
          quedándose en el ancho del <main>, en tablet y escritorio se veía una
          barra flotando con el contenido pasando descubierto por los costados. */}
      {nav === 'secciones' && !searching && groups.length > 1 && (
        <div
          className="menu-bleed"
          style={{
            position: 'sticky', top: 0, zIndex: 5, marginTop: 4,
            background: 'color-mix(in srgb, var(--brand-bg) 88%, transparent)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--u-hair)',
          }}
        >
          <div
            className="u-noscroll menu-canvas"
            style={{
              // Se alinea con el <main>: misma clase, mismo ancho, mismo
              // relleno, en cualquier pantalla.
              display: 'flex', gap: 8, overflowX: 'auto', paddingBlock: '12px 10px',
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
        </div>
      )}

      {/* Volver del menú de una categoría al selector de portadas. */}
      {nav === 'portadas' && activeCat !== null && !searching && (
        <button
          onClick={() => setActiveCat(null)}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14,
            padding: '10px 15px', minHeight: 44, borderRadius: 'var(--m-r-pill)', cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--u-hair)', color: 'var(--u-text-2)',
            fontWeight: 600, fontSize: 'var(--m-fs-sm)',
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
              <p className="t-mute" style={{ fontSize: 'var(--m-fs-md)', margin: 0, lineHeight: 1.5 }}>
                No encontramos nada con <strong style={{ color: 'var(--u-text-2)' }}>“{query.trim()}”</strong>.
              </p>
              <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', margin: 0 }}>Revisa cómo se escribe o mira el menú completo.</p>
              <button
                onClick={() => { setQuery(''); setActiveCat(null); }}
                className={`press ${ctaClass(config.ctaStyle)}`}
                style={{ marginTop: 4, padding: '12px 20px', minHeight: 44, borderRadius: 'var(--m-r-pill)', cursor: 'pointer', fontWeight: 700, fontSize: 'var(--m-fs-md)' }}
              >
                Ver todo el menú
              </button>
            </>
          ) : (
            <p className="t-mute" style={{ fontSize: 'var(--m-fs-md)', margin: 0 }}>{content.catalog.empty}</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: nav === 'acordeon' ? 8 : width === 'revista' ? 44 : width === 'ancho' ? 34 : 26, marginTop: groupByCategory ? 16 : 0 }}>
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
                    width={width}
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
          <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    padding: '11px 14px', borderRadius: 'var(--m-r-md)', border: '1px solid var(--u-hair)',
                    background: 'var(--surface-2)', color: 'var(--u-text)', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--m-r-sm)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--u-hair)', color: 'var(--u-text-2)' }}>
                    <Icon name={config.showCategoryIcons ? (catIcon.get(c.id) ?? 'utensils') : 'clock'} size={17} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--m-fs-md)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{localize(c.name, c.name_en)}</span>
                    <span style={{ display: 'block', fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-4)', marginTop: 1 }}>
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
  /** Composición (esqueleto) que toca. Ver lib/theme/canvas.ts. */
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
     escritorio cada tarjeta acabaría midiendo medio metro.

     `minmax(0, 1fr)` y no `1fr`: son la misma cosa salvo por el mínimo, y ahí
     está la diferencia. `1fr` es en realidad `minmax(auto, 1fr)`, y ese
     `auto` es el mínimo de CONTENIDO de la pieza — o sea que basta una
     tarjeta que declare un ancho mínimo para que la columna entera se plante
     en él y la rejilla se salga de la página. Es exactamente lo que pasaba
     con la reserva de `content-visibility` (ver `.menu-card-lazy` en
     globals.css): dos columnas de 280 px dentro de 358, cortadas contra el
     canto derecho de la pantalla. Con mínimo 0 la rejilla no puede
     desbordar, pase lo que pase dentro de las piezas. */
  const wide = width !== 'movil';
  /* En lienzo ancho el reparto lo hace `auto-fill` con un ancho minimo, asi que
     se puede seguir declarando aqui. En TELEFONO no: las columnas tienen que
     poder recortarse por media query cuando la pantalla no da, y un estilo EN
     LINEA le gana a cualquier media query. Ahi el numero viaja en `data-cols`
     y quien pinta la rejilla es `.m-grid` en globals.css. */
  const gridCols = wide
    ? `repeat(auto-fill, minmax(${LAYOUT_MIN_COL[width]}px, 1fr))`
    : undefined;

  const fade = (i: number) => ({
    className: anim ? 'anim-fade-up' : '',
    style: { animationDelay: anim ? `${Math.min(i, 8) * 35}ms` : undefined },
  });

  /**
   * Igual que fade(), más el marcado que deja al navegador SALTARSE el pintado
   * de las tarjetas que están fuera de pantalla (ver .menu-card-lazy en
   * globals.css). En una carta larga esto es la diferencia entre maquetar y
   * pintar 120 tarjetas con foto antes de enseñar la primera, o pintar las
   * seis que caben en el teléfono.
   *
   * `shape` solo elige el alto estimado que se reserva mientras la tarjeta
   * sigue sin pintar; en cuanto se pinta una vez, el navegador se queda con
   * el alto real (por el `auto` de contain-intrinsic-size).
   *
   * NO se usa en la variante 'texto': esa se maqueta con columnCount, y el
   * reparto en columnas necesita medir todo el contenido de verdad — con
   * altos estimados los cortes de columna saldrían donde no toca. Tampoco en
   * los destacados: son pocos, van arriba del todo y se ven desde el principio.
   */
  const fadeLazy = (i: number, shape: 'tarjeta' | 'fila') => ({
    ...fade(i),
    className: `${fade(i).className} menu-card-lazy`.trim(),
    'data-shape': shape,
  });

  if (card === 'texto') {
    /* Carta impresa: sin una sola imagen. El contraste entre nombre y precio lo
       hace la línea de puntos, no una foto.
       En escritorio se parte en dos columnas: una sola línea de puntos de
       1.100 px separa tanto el nombre del precio que deja de leerse como un
       par — y así es como se compone una carta impresa de verdad. */
    const cols = textColumns(width);
    return (
      <div style={{ columnCount: cols, columnGap: 54, marginTop: 4 }}>
        {items.map((p, i) => (
          <div key={p.id} {...fade(i)} style={{ ...fade(i).style, breakInside: 'avoid' }}>
            <TextRow {...common(p)} />
          </div>
        ))}
      </div>
    );
  }

  if (card === 'carrusel') {
    const tileW = width === 'revista' ? 232 : width === 'ancho' ? 204 : 152;
    return (
      <div
        className="u-noscroll"
        style={{
          display: 'flex', gap: 12, overflowX: 'auto', marginTop: 10,
          // El margen negativo deja que las piezas se deslicen hasta el borde
          // de la pantalla en vez de cortarse contra el padding del <main>,
          // que ya no siempre es de 16 px (ver --menu-pad en globals.css).
          paddingBlock: '2px 6px', paddingInline: 'var(--menu-pad)',
          marginInline: 'calc(-1 * var(--menu-pad))', scrollSnapType: 'x proximity',
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
    const lead = items.filter((p) => featuredIds.has(p.id));
    const rest = items.filter((p) => !featuredIds.has(p.id));
    /* El reparto lo decide `mosaicColumns` (lib/theme/canvas.ts): el mosaico
       no usa la rejilla que se auto-ajusta —coloca las piezas a mano por
       altura— así que necesita un número, y ese número tiene que crecer con
       la pantalla o en un monitor salen piezas de medio metro. */
    const n = mosaicColumns(width, config.catalogColumns, rest.length);
    const layoutN = mosaicLayoutColumns(width, config.catalogColumns);
    /* Sección más corta que la fila: las piezas NO se estiran a rellenar el
       monitor. Una sección de dos platillos en un lienzo de 1.300 px daba dos
       tarjetas de 646 px cada una — más parecidas a dos carteles que a un
       mosaico. Se dibujan a tamaño normal y el grupo se centra. */
    const short = n < layoutN;
    const columns = packColumns(rest, n);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {/* El destacado abre la sección a todo lo ancho, como la foto de
            apertura de un reportaje. Metido dentro de una columna medía lo
            mismo que las demás y su rótulo "FAVORITO" se montaba encima del
            nombre del platillo. */}
        {lead.map((p, i) => (
          <div key={p.id} {...fade(i)}>
            <FeaturedTile {...common(p)} width={width} />
          </div>
        ))}
        <div
          style={{
            display: 'grid', gap: 12, alignItems: 'start',
            // El tope va en la PISTA, no en la caja: la caja sigue ocupando
            // todo el ancho y son las columnas las que se quedan en su tamaño
            // y se centran. Recortar la caja con `margin-inline: auto` parecía
            // equivalente y no lo es — dentro de un contenedor flex ese margen
            // cancela el estirado y la rejilla se encogía a 12 px.
            gridTemplateColumns: short
              ? `repeat(${n}, minmax(0, ${MOSAIC_MAX_TILE}px))`
              : `repeat(${n}, minmax(0, 1fr))`,
            ...(short ? { justifyContent: 'center' } : {}),
          }}
        >
          {columns.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {col.map(({ p, i }) => (
                <div key={p.id} {...fadeLazy(i, 'tarjeta')}>
                  <MosaicTile {...common(p)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (card === 'fila') {
    /* Una fila por platillo en el teléfono; en pantallas anchas se reparten en
       dos o tres para que la miniatura de 74 px no quede flotando al principio
       de una línea de un metro. */
    return (
      <div
        style={{
          display: 'grid', gap: 10, marginTop: 12,
          gridTemplateColumns: wide ? `repeat(auto-fill, minmax(${width === 'revista' ? 330 : 340}px, 1fr))` : '1fr',
        }}
      >
        {items.map((p, i) => {
          const featured = featuredIds.has(p.id);
          const attrs = featured ? fade(i) : fadeLazy(i, 'fila');
          return (
            <div key={p.id} {...attrs} style={{ ...attrs.style, gridColumn: featured && wide ? '1 / -1' : undefined }}>
              {featured ? <FeaturedTile {...common(p)} width={width} /> : <ProductRow {...common(p)} />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    /* `data-cols` lleva al CSS las columnas que pidio el dueno, que es quien
       puede recortarlas cuando la pantalla no da para tantas (ver `.m-grid` en
       globals.css). El ajuste del dueno es un TECHO: la pantalla lo baja, nunca
       lo sube — la misma regla que ya aplica `canvasComposition`. */
    <div
      className="m-grid"
      data-cols={wide ? undefined : config.catalogColumns}
      style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 'var(--m-sp-3)', marginTop: 'var(--m-sp-3)' }}
    >
      {items.map((p, i) => {
        const featured = featuredIds.has(p.id);
        const attrs = featured ? fade(i) : fadeLazy(i, 'tarjeta');
        return (
          <div key={p.id} {...attrs} style={{ ...attrs.style, gridColumn: featured ? '1 / -1' : undefined }}>
            {featured ? <FeaturedTile {...common(p)} width={width} /> : <ProductTile {...common(p)} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Mosaico: reparto en columnas ─────────────────────────────
   `column-count` de CSS parecía la solución obvia, pero equilibra las columnas
   a ojo del navegador y con piezas de altura desigual dejaba huecos de 800 px:
   una sección de siete tacos salía con tres piezas en una columna y una sola en
   la de al lado. Aquí se reparte a mano: cada platillo cae en la columna más
   corta de momento, que es como se arma cualquier mosaico editorial. Los
   primeros N ocupan la primera fila en orden, así que la carta se sigue leyendo
   de izquierda a derecha.

   La altura se ESTIMA (no se mide): el arte es 1/proporción del ancho de la
   columna y el bloque de texto ronda 0,7 anchos. Basta para equilibrar, y al no
   depender del DOM el reparto es idéntico en el servidor y en el navegador — sin
   parpadeo de recolocación al hidratar. */
function packColumns(items: ProdItem[], n: number): Array<Array<{ p: ProdItem; i: number }>> {
  const cols: Array<Array<{ p: ProdItem; i: number }>> = Array.from({ length: Math.max(1, n) }, () => []);
  const heights = new Array(cols.length).fill(0);
  items.forEach((p, i) => {
    let target = 0;
    for (let c = 1; c < cols.length; c++) if (heights[c] < heights[target] - 0.001) target = c;
    cols[target].push({ p, i });
    heights[target] += 1 / mosaicRatio(p) + (p.description ? 0.74 : 0.52);
  });
  return cols;
}

/* ── Piezas de navegación ─────────────────────────────────── */

function CategoryChip({ label, icon, active, unavailable = false, onClick }: { label: string; icon?: string; active: boolean; unavailable?: boolean; onClick: () => void }) {
  // Fuera de horario (y no seleccionado): se atenúa y muestra un reloj, pero
  // sigue tocable para que el comensal pueda ver ese menú.
  const dim = unavailable && !active;
  return (
    <button
      onClick={onClick}
      className="press m-chip"
      // aria-pressed: sin esto, quien navega con lectura asistida no sabe qué
      // categoría está filtrando — el resaltado es solo visual.
      aria-pressed={active}
      title={unavailable ? 'Disponible en otro horario' : undefined}
      data-active={active ? '1' : undefined}
      data-dim={dim ? '1' : undefined}
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
  label, icon, count, locked, collapsible, open, width = 'movil', onToggle,
}: {
  label: string; icon?: string; count: number; locked: boolean;
  collapsible: boolean; open: boolean; width?: LayoutWidth; onToggle: () => void;
}) {
  const t = useText('poster', 'catalogSection');
  // El rótulo de sección manda sobre una página ancha: a 20 px se perdía entre
  // cuatro columnas de fotos y la carta dejaba de leerse por bloques.
  const size = collapsible ? 20 : width === 'revista' ? 30 : width === 'ancho' ? 25 : 20;
  const inner = (
    <>
      {icon && <Icon name={icon} size={collapsible ? 17 : Math.round(size * 0.82)} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />}
      <span className="t-poster" style={{ ...t.vars, fontSize: size * t.size, flex: 1, minWidth: 0, textAlign: 'left' }}>
        {label}
      </span>
      {locked && <Icon name="clock" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
      <span className="t-mono m-sec-count">{count}</span>
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
        className="press m-sec-btn"
        aria-expanded={open}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="m-sec">
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
      className="m-note"
    >
      <span style={{ color: 'var(--u-text-3)', flexShrink: 0 }}><Icon name="clock" size={17} /></span>
      <div>
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
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--m-sp-3)', marginTop: 'var(--m-sp-4)' }}>
      {shown.map((c, i) => {
        const locked = catAvail.get(c.id) === false;
        const n = counts.get(c.id) ?? 0;
        return (
          <MenuSurface
            key={c.id}
            onClick={() => onPick(c.id)}
            ariaLabel={`Ver ${localize(c.name, c.name_en)}`}
            className={`m-tile ${config.animations ? 'anim-fade-up' : ''}`}
            style={{
              borderRadius: 'var(--m-r-xl)', opacity: locked ? 0.75 : 1,
              animationDelay: config.animations ? `${Math.min(i, 8) * 45}ms` : undefined,
            }}
          >
            <div className="m-tile-art" style={{ aspectRatio: cols === 1 ? '2.6' : '1.6' }}>
              <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
                <BrandPattern icon={catIcon.get(c.id) ?? 'utensils'} seed={seedFromString(c.id)} iconScale={1.5} />
              </div>
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0) 80%)' }} />
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-poster" style={{ fontSize: 'var(--m-fs-2xl)', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.05 }}>
                    {localize(c.name, c.name_en)}
                  </div>
                  <div style={{ fontSize: 'var(--m-fs-xs)', color: 'rgba(255,255,255,0.82)', marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {locked ? 'Disponible en otro horario' : `${n} ${n === 1 ? 'platillo' : 'platillos'}`}
                  </div>
                </div>
                <span style={{ width: 38, height: 38, borderRadius: 'var(--m-r-pill)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', color: '#fff' }}>
                  <Icon name={locked ? 'clock' : 'chevronRight'} size={18} />
                </span>
              </div>
            </div>
          </MenuSurface>
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
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 44, minHeight: 44, padding: '5px 12px', borderRadius: 'var(--m-r-pill)', background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 700, fontSize: 'var(--m-fs-sm)' }}
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
          width: 44, height: 44, borderRadius: 'var(--m-r-pill)', cursor: 'pointer', display: 'grid', placeItems: 'center',
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
      style={{ width: 44, height: 44, borderRadius: 'var(--m-r-md)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
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
    <MenuSurface className="m-tile" unavailable={unavail} onClick={() => onOpen(p)} ariaLabel={`Ver ${name}`}>
      <div className="m-tile-art" style={{ aspectRatio: '1.25' }}>
        <ProductArt p={p} icon={icon} />
        {config.showTags && p.tags && p.tags.length > 0 && !unavail && (
          <div className="m-art-corner">
            {p.tags.slice(0, 2).map((t) => <Tag key={t} label={t} small />)}
          </div>
        )}
        {unavail && (
          <div className="m-art-corner"><span className="m-badge">No disponible</span></div>
        )}
      </div>
      <div className="m-tile-body">
        <div className={`ct-product-name m-name ${unavail ? 'm-strike' : ''}`}>{name}</div>
        <DietaryBadges keys={p.dietary_tags} />
        <div className="m-foot">
          <Price amount={displayPrice(p)} size={14} muted={unavail} />
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </MenuSurface>
  );
}

/* Pieza de mosaico: como la tarjeta, pero con el arte de altura variable para
   que la columna quede desigual a propósito (el ritmo editorial de una
   revista). La proporción sale del id del producto, así que es estable entre
   renders — si fuera aleatoria, la carta "bailaría" en cada actualización. */
const MOSAIC_RATIOS = [1.35, 0.86, 1.05, 0.72];

function mosaicRatio(p: ProdItem): number {
  return MOSAIC_RATIOS[seedFromString(p.id) % MOSAIC_RATIOS.length];
}

function MosaicTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  const ratio = mosaicRatio(p);
  return (
    <MenuSurface className="m-tile" unavailable={unavail} onClick={() => onOpen(p)} ariaLabel={`Ver ${name}`}>
      <div className="m-tile-art" style={{ aspectRatio: String(ratio) }}>
        <ProductArt p={p} icon={icon} scale={1.15} />
        {config.showTags && p.tags?.[0] && !unavail && (
          <div className="m-art-corner"><Tag label={p.tags[0]} small /></div>
        )}
        {unavail && (
          <div className="m-art-corner"><span className="m-badge">No disponible</span></div>
        )}
      </div>
      <div className="m-tile-body">
        <div className={`ct-product-name m-name ${unavail ? 'm-strike' : ''}`}>{name}</div>
        {description && <div className="line-clamp-2 ct-product-desc m-desc">{description}</div>}
        <DietaryBadges keys={p.dietary_tags} />
        <div className="m-foot">
          <Price amount={displayPrice(p)} size={14} muted={unavail} />
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </MenuSurface>
  );
}

/* Tarjeta destacada: ancho completo, arte grande y texto sobre un degradado
   (blanco sobre velo oscuro = legible con foto o patrón en cualquier paleta).

   La proporción se abre con el lienzo EFECTIVO. Con 1.85 fijo, una tarjeta de
   ancho completo en una página de 1.120 px medía 600 px de alto: media
   pantalla de escritorio para un solo platillo. Ojo con "arreglarlo" poniendo
   un `minHeight` junto al `aspect-ratio`: en un teléfono el navegador respeta
   la proporción ensanchando la caja, y la tarjeta se iba a 645 px de ancho
   fuera de la pantalla. */
const FEATURED_RATIO: Record<LayoutWidth, number> = { movil: 1.85, ancho: 2.5, revista: 3.1 };

function FeaturedTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, width = 'movil', onAdd, onOpen }: TileProps & { width?: LayoutWidth }) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  const wideFeat = width !== 'movil';
  return (
    <MenuSurface
      className="m-tile"
      style={{ borderRadius: 'var(--m-r-xl)' }}
      unavailable={unavail}
      onClick={() => onOpen(p)}
      ariaLabel={`Ver ${name}`}
    >
      <div className="m-tile-art" style={{ aspectRatio: String(FEATURED_RATIO[width] ?? 1.85) }}>
        <ProductArt p={p} icon={icon} scale={1.35} />
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.24) 46%, rgba(0,0,0,0) 72%)' }}
        />
        <div style={{ position: 'absolute', top: wideFeat ? 20 : 10, left: wideFeat ? 24 : 10 }}>
          <span
            className="ct-tag"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 'var(--m-r-pill)',
              background: 'var(--brand-accent)', color: 'var(--brand-on-accent)',
              fontSize: 'calc(var(--m-fs-xs) * var(--t-tag-size, 1))', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}
          >
            <Icon name="star" size={11} /> {content.tags.fav}
          </span>
        </div>
        <div style={{ position: 'absolute', left: wideFeat ? 24 : 14, right: wideFeat ? 24 : 14, bottom: wideFeat ? 20 : 12, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          {/* El texto no se estira con la tarjeta: una descripción a 1.000 px de
              ancho se lee como un pie de foto de periódico, no como un plato. */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 620 }}>
            <div
              className="ct-product-name"
              style={{ fontSize: (wideFeat ? 27 : 19) * roleSize(config, 'productName'), color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', lineHeight: 1.15, textDecoration: unavail ? 'line-through' : 'none' }}
            >
              {name}
            </div>
            {description && (
              <div className="line-clamp-2" style={{ fontSize: (wideFeat ? 13.5 : 12) * roleSize(config, 'productDesc'), color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 1.4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {description}
              </div>
            )}
            <Price amount={displayPrice(p)} size={wideFeat ? 20 : 17} style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', marginTop: 5, display: 'inline-block' }} />
          </div>
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </MenuSurface>
  );
}

function ProductRow({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: TileProps) {
  const config = useThemeConfig();
  const name = useLocalized(p.name, p.name_en);
  const description = useLocalized(p.description ?? '', p.description_en);
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <MenuSurface className="m-row" unavailable={unavail} onClick={() => onOpen(p)} ariaLabel={`Ver ${name}`}>
      <div className="m-row-art">
        <ProductArt p={p} icon={icon} scale={0.9} />
      </div>
      <div className="m-row-body">
        <div style={{ display: 'flex', gap: 'var(--m-sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className={`ct-product-name m-name ${unavail ? 'm-strike' : ''}`}>{name}</div>
          {unavail && <span className="m-badge m-badge-quiet">No disponible</span>}
          {config.showTags && !unavail && p.tags?.[0] && <Tag label={p.tags[0]} small />}
        </div>
        {description && <div className="line-clamp-2 ct-product-desc m-desc">{description}</div>}
        <DietaryBadges keys={p.dietary_tags} size={12} />
        <Price amount={displayPrice(p)} size={14} muted={unavail} />
      </div>
      {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
    </MenuSurface>
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
      data-unavailable={unavail ? '1' : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--m-sp-3)',
        padding: 'var(--m-sp-4) 2px', borderBottom: '1px solid var(--u-hair)',
        cursor: unavail ? 'default' : 'pointer',
        /* 0.62 dejaba la descripcion por debajo del contraste minimo: el plato
           se leia como "borroso" y no como "hoy no esta". */
        opacity: unavail ? 0.72 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--m-sp-2)' }}>
          <span className={`ct-product-name m-name ${unavail ? 'm-strike' : ''}`}>
            {name}
          </span>
          {/* El filete punteado es lo que hace legible el par nombre→precio sin
              una foto de por medio: el ojo lo sigue de un lado al otro. */}
          <span aria-hidden style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted var(--u-hair-2)' }} />
          <Price amount={displayPrice(p)} size={14} muted={unavail} />
        </div>
        {description && (
          <div className="ct-product-desc m-desc" style={{ marginTop: 'var(--m-sp-1)', maxWidth: '46em' }}>
            {description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--m-sp-2)', marginTop: 'var(--m-sp-2)', flexWrap: 'wrap' }}>
          <DietaryBadges keys={p.dietary_tags} size={12} />
          {config.showTags && !unavail && p.tags?.[0] && <Tag label={p.tags[0]} small />}
          {unavail && (
            <span className="m-badge m-badge-quiet">
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
