'use client';

/* Catálogo del cliente — búsqueda, categorías con ícono, grid/list, tarjetas con
   BrandPattern o foto, tags y agregar al carrito. Portado de ClientScreens.jsx. */

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon, ICON_PATHS } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Price, Tag, ctaClass } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { roleSize } from '@/lib/theme/resolve';
import { isOpenNow, nextOpenLabel, hasAnyHours, todayWindowLabel, type WeeklyHours } from '@/lib/hours';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'> & {
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

/** Ícono para el patrón/categoría: el nombre SVG de la categoría o un default.
   Si el valor guardado no es un ícono SVG válido (p. ej. un emoji viejo), cae
   a 'utensils' para no renderizar un ícono vacío. */
function pickIcon(icon: string | null | undefined): string {
  return icon && ICON_PATHS[icon.trim()] ? icon.trim() : 'utensils';
}

export default function Catalog({
  categories, products, ordersEnabled, timezone = 'America/Guatemala', qtyOf, onAdd, onOpen,
}: CatalogProps) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const kickerT = useText('kicker', 'catalogKicker');
  const headingT = useText('poster', 'catalogHeading');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  // Menús programados que ahora están fuera de horario (para la franja "más tarde").
  const upcoming = categories.filter((c) => hasAnyHours(c.availability) && catAvail.get(c.id) === false);

  // ¿La categoría seleccionada está fuera de su horario? → solo lectura.
  const activeCatLocked = activeCat !== null && catAvail.get(activeCat) === false;
  const activeCatItem = activeCat !== null ? categories.find((c) => c.id === activeCat) ?? null : null;

  // Busca en nombre, descripción y tags, ignorando acentos.
  const q = fold(query.trim());
  const list = products.filter((p) => {
    if (activeCat !== null) {
      if (p.category_id !== activeCat) return false;
    } else if (p.category_id != null && catAvail.get(p.category_id) === false) {
      // Vista "Todos": se ocultan los menús fuera de horario (siguen accesibles
      // tocando su chip o la franja "Disponibles más tarde").
      return false;
    }
    if (!q) return true;
    const haystack = fold([p.name, p.description ?? '', ...(p.tags ?? [])].join(' '));
    return haystack.includes(q);
  });

  const kicker = content.catalog.kicker || [config.brandName, config.zone].filter(Boolean).join(' · ');
  const cols = config.catalogColumns;

  // Ids que se dibujan como tarjeta destacada (primeros N favoritos disponibles).
  const featuredIds = new Set<string>();
  if (config.featuredFavorites) {
    for (const p of list) {
      if (featuredIds.size >= FEATURED_LIMIT) break;
      if (isFeaturedTag(p) && !isUnavailable(p)) featuredIds.add(p.id);
    }
  }

  return (
    <div>
      {/* Header */}
      <div>
        <div className="t-kicker" style={{ ...kickerT.vars, fontSize: 12 * kickerT.size }}>{kicker}</div>
        <h2 className="t-poster" style={{ ...headingT.vars, fontSize: `calc(${headingT.size} * clamp(34px, 11vw, 44px))`, marginTop: 2 }}>
          {content.catalog.heading}
        </h2>
      </div>

      {/* Búsqueda */}
      {config.showSearch && (
        <div style={{ position: 'relative', marginTop: 14 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}>
            <Icon name="search" size={17} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={content.catalog.searchPlaceholder}
            className="glass-quiet ct-body"
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 13, border: 'none', color: 'var(--u-text)', fontSize: 14, outline: 'none', background: 'var(--surface-2)' }}
          />
        </div>
      )}

      {/* Categorías */}
      <div className="u-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 6px' }}>
        <CategoryChip label={content.catalog.allLabel} icon={config.showCategoryIcons ? 'grid' : undefined} active={activeCat === null} onClick={() => setActiveCat(null)} />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            icon={config.showCategoryIcons ? catIcon.get(c.id) : undefined}
            active={activeCat === c.id}
            unavailable={catAvail.get(c.id) === false}
            onClick={() => setActiveCat(c.id)}
          />
        ))}
      </div>

      {/* Aviso: el menú seleccionado está fuera de su horario (solo lectura) */}
      {activeCatLocked && activeCatItem && (
        <div
          role="status"
          style={{
            display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, marginBottom: 2,
            background: 'var(--surface-2)', border: '1px solid var(--u-hair)',
            borderRadius: 14, padding: '11px 14px',
          }}
        >
          <span style={{ color: 'var(--u-text-3)', flexShrink: 0 }}><Icon name="clock" size={17} /></span>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--u-text)' }}>{activeCatItem.name}</strong>{' '}
            {(() => {
              const reopen = nextOpenLabel(activeCatItem.availability, timezone, now);
              const win = todayWindowLabel(activeCatItem.availability, timezone, now);
              return reopen
                ? `se sirve ${reopen}.`
                : win ? `se sirve de ${win}.` : 'no está disponible ahora.';
            })()}{' '}
            Puedes verlo, pero aún no pedirlo.
          </div>
        </div>
      )}

      {/* Grid / List */}
      {list.length === 0 ? (
        <p className="t-mute" style={{ textAlign: 'center', padding: '50px 0', fontSize: 14 }}>{content.catalog.empty}</p>
      ) : config.catalogView === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginTop: 12 }}>
          {list.map((p, i) => {
            const featured = featuredIds.has(p.id);
            return (
              <div key={p.id} className={config.animations ? 'anim-fade-up' : ''} style={{ gridColumn: featured ? '1 / -1' : undefined, animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
                {featured ? (
                  <FeaturedTile p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} forceUnavailable={activeCatLocked} onAdd={onAdd} onOpen={onOpen} />
                ) : (
                  <ProductTile p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} forceUnavailable={activeCatLocked} onAdd={onAdd} onOpen={onOpen} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {list.map((p, i) => (
            <div key={p.id} className={config.animations ? 'anim-fade-up' : ''} style={{ animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
              {featuredIds.has(p.id) ? (
                <FeaturedTile p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} forceUnavailable={activeCatLocked} onAdd={onAdd} onOpen={onOpen} />
              ) : (
                <ProductRow p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} forceUnavailable={activeCatLocked} onAdd={onAdd} onOpen={onOpen} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Disponibles más tarde — solo en la vista "Todos" (sin búsqueda) */}
      {activeCat === null && !q && upcoming.length > 0 && (
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
                    <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
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

function CategoryChip({ label, icon, active, unavailable = false, onClick }: { label: string; icon?: string; active: boolean; unavailable?: boolean; onClick: () => void }) {
  // Fuera de horario (y no seleccionado): se atenúa y muestra un reloj, pero
  // sigue tocable para que el comensal pueda ver ese menú.
  const dim = unavailable && !active;
  return (
    <button
      onClick={onClick}
      className="press"
      title={unavailable ? 'Disponible en otro horario' : undefined}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 99, cursor: 'pointer',
        background: active ? 'var(--u-text)' : 'var(--surface-2)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
        border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
        fontWeight: 600, fontSize: 13.5, opacity: dim ? 0.55 : 1,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {dim ? <Icon name="clock" size={14} /> : icon && <Icon name={icon} size={15} />}
      {label}
    </button>
  );
}

/* ── Arte del producto: foto o BrandPattern según config.productArt ── */
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

function AddControl({ p, qty, onAdd }: { p: ProdItem; qty: number; onAdd: (p: ProdItem, el: HTMLElement) => void }) {
  const config = useThemeConfig();
  if (qty > 0) {
    return (
      <span className="t-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 700, fontSize: 12 }}>
        <Icon name="check" size={11} strokeWidth={3} />{qty}
      </span>
    );
  }
  return (
    <button
      // Sigue el estilo de CTA elegido por el restaurante (antes btn-white fijo,
      // que se lavaba con paletas claras e ignoraba la opción del editor).
      className={`press ${ctaClass(config.ctaStyle)}`}
      onClick={(e) => { e.stopPropagation(); onAdd(p, e.currentTarget); }}
      style={{ width: 32, height: 32, borderRadius: 10, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      aria-label={`Agregar ${p.name}`}
    >
      <Icon name="plus" size={17} strokeWidth={2.4} />
    </button>
  );
}

function ProductTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: { p: ProdItem; icon: string; qty: number; ordersEnabled: boolean; forceUnavailable?: boolean; onAdd: (p: ProdItem, el: HTMLElement) => void; onOpen: (p: ProdItem) => void }) {
  const config = useThemeConfig();
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass
      interactive={!unavail}
      onClick={() => !unavail && onOpen(p)}
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
        <div className="ct-product-name" style={{ fontSize: 14.5 * roleSize(config, 'productName'), flex: 1, textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Price amount={displayPrice(p)} size={15} muted={unavail} />
          {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </Glass>
  );
}

/* Tarjeta destacada: ancho completo, arte grande y texto sobre un degradado
   (blanco sobre velo oscuro = legible con foto o patrón en cualquier paleta). */
function FeaturedTile({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: { p: ProdItem; icon: string; qty: number; ordersEnabled: boolean; forceUnavailable?: boolean; onAdd: (p: ProdItem, el: HTMLElement) => void; onOpen: (p: ProdItem) => void }) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass
      interactive={!unavail}
      onClick={() => !unavail && onOpen(p)}
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
              {p.name}
            </div>
            {p.description && (
              <div className="line-clamp-2" style={{ fontSize: 12 * roleSize(config, 'productDesc'), color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 1.4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {p.description}
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

function ProductRow({ p, icon, qty, ordersEnabled, forceUnavailable = false, onAdd, onOpen }: { p: ProdItem; icon: string; qty: number; ordersEnabled: boolean; forceUnavailable?: boolean; onAdd: (p: ProdItem, el: HTMLElement) => void; onOpen: (p: ProdItem) => void }) {
  const config = useThemeConfig();
  const unavail = forceUnavailable || isUnavailable(p);
  return (
    <Glass interactive={!unavail} onClick={() => !unavail && onOpen(p)} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 13, alignItems: 'center', cursor: unavail ? 'default' : 'pointer', opacity: unavail ? 0.72 : 1 }}>
      <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-1)', position: 'relative' }}>
        <ProductArt p={p} icon={icon} scale={0.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="ct-product-name" style={{ fontSize: 15.5 * roleSize(config, 'productName'), textDecoration: unavail ? 'line-through' : 'none', textDecorationColor: 'var(--surface-strike)' }}>{p.name}</div>
          {unavail && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--surface-3)', color: 'var(--u-text-4)', border: '1px solid var(--u-hair)' }}>No disponible</span>}
          {config.showTags && !unavail && p.tags?.[0] && <Tag label={p.tags[0]} small />}
        </div>
        {p.description && (
          <div className="line-clamp-2 ct-product-desc" style={{ fontSize: 12 * roleSize(config, 'productDesc') }}>{p.description}</div>
        )}
        <Price amount={displayPrice(p)} size={15} muted={unavail} />
      </div>
      {ordersEnabled && !unavail && <AddControl p={p} qty={qty} onAdd={onAdd} />}
    </Glass>
  );
}
