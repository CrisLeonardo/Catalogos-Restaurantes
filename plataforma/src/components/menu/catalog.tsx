'use client';

/* Catálogo del cliente — búsqueda, categorías con ícono, grid/list, tarjetas con
   BrandPattern o foto, tags y agregar al carrito. Portado de ClientScreens.jsx. */

import Image from 'next/image';
import { useMemo, useState, type RefObject } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { Price, Tag } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'>;

/** Normaliza para buscar sin acentos ni mayúsculas ("cafe" encuentra "Café"). */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface CatalogProps {
  categories: CatItem[];
  products: ProdItem[];
  ordersEnabled: boolean;
  qtyOf: (productId: string) => number;
  onAdd: (product: ProdItem, sourceEl: HTMLElement) => void;
  onOpen: (product: ProdItem) => void;
  cartCount: number;
  onOpenCart: () => void;
  cartIconRef: RefObject<HTMLButtonElement | null>;
}

/** Ícono para el patrón/categoría: el de la categoría o un default. */
function pickIcon(icon: string | null | undefined): string {
  return icon && icon.trim() ? icon : 'utensils';
}

export default function Catalog({
  categories, products, ordersEnabled, qtyOf, onAdd, onOpen, cartCount, onOpenCart, cartIconRef,
}: CatalogProps) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const catIcon = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, pickIcon(c.icon));
    return m;
  }, [categories]);

  // Busca en nombre, descripción y tags, ignorando acentos.
  const q = fold(query.trim());
  const list = products.filter((p) => {
    if (activeCat !== null && p.category_id !== activeCat) return false;
    if (!q) return true;
    const haystack = fold([p.name, p.description ?? '', ...(p.tags ?? [])].join(' '));
    return haystack.includes(q);
  });

  const kicker = content.catalog.kicker || [config.brandName, config.zone].filter(Boolean).join(' · ');
  const cols = config.catalogColumns;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="t-kicker" style={{ fontSize: 12 }}>{kicker}</div>
          <h2 className="t-poster" style={{ fontSize: 'clamp(34px, 11vw, 44px)', lineHeight: 0.95, marginTop: 2 }}>
            {content.catalog.heading}
          </h2>
        </div>
        {ordersEnabled && (
          <button
            ref={cartIconRef}
            onClick={onOpenCart}
            className="press glass"
            style={{ position: 'relative', width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center', color: 'var(--u-text)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Ver carrito"
          >
            <Icon name="bag" size={21} />
            {cartCount > 0 && (
              <span className="t-mono" style={{ position: 'absolute', top: -5, right: -5, minWidth: 21, height: 21, padding: '0 5px', borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid var(--brand-bg)' }}>
                {cartCount}
              </span>
            )}
          </button>
        )}
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
            className="glass-quiet"
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 13, border: 'none', color: 'var(--u-text)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)' }}
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
            onClick={() => setActiveCat(c.id)}
          />
        ))}
      </div>

      {/* Grid / List */}
      {list.length === 0 ? (
        <p className="t-mute" style={{ textAlign: 'center', padding: '50px 0', fontSize: 14 }}>{content.catalog.empty}</p>
      ) : config.catalogView === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginTop: 12 }}>
          {list.map((p, i) => (
            <div key={p.id} className={config.animations ? 'anim-fade-up' : ''} style={{ animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
              <ProductTile p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} onAdd={onAdd} onOpen={onOpen} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {list.map((p, i) => (
            <div key={p.id} className={config.animations ? 'anim-fade-up' : ''} style={{ animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
              <ProductRow p={p} icon={p.icon || catIcon.get(p.category_id ?? '') || 'utensils'} qty={qtyOf(p.id)} ordersEnabled={ordersEnabled} onAdd={onAdd} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ label, icon, active, onClick }: { label: string; icon?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press"
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 99, cursor: 'pointer',
        background: active ? 'var(--u-text)' : 'rgba(255,255,255,0.05)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
        border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
        fontWeight: 600, fontSize: 13.5,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {icon && <Icon name={icon} size={15} />}
      {label}
    </button>
  );
}

/* ── Arte del producto: foto o BrandPattern según config.productArt ── */
function ProductArt({ p, icon, scale = 1 }: { p: ProdItem; icon: string; scale?: number }) {
  const config = useThemeConfig();
  const usePhoto = p.image_url && config.productArt !== 'pattern';
  if (usePhoto) {
    return <Image src={p.image_url!} alt={p.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 440px) 50vw, 220px" unoptimized />;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
      <BrandPattern icon={icon} seed={seedFromString(p.id)} iconScale={scale} />
    </div>
  );
}

function AddControl({ p, qty, onAdd }: { p: ProdItem; qty: number; onAdd: (p: ProdItem, el: HTMLElement) => void }) {
  if (qty > 0) {
    return (
      <span className="t-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 700, fontSize: 12 }}>
        <Icon name="check" size={11} strokeWidth={3} />{qty}
      </span>
    );
  }
  return (
    <button
      className="press btn-white"
      onClick={(e) => { e.stopPropagation(); onAdd(p, e.currentTarget); }}
      style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      aria-label={`Agregar ${p.name}`}
    >
      <Icon name="plus" size={17} strokeWidth={2.4} />
    </button>
  );
}

function ProductTile({ p, icon, qty, ordersEnabled, onAdd, onOpen }: { p: ProdItem; icon: string; qty: number; ordersEnabled: boolean; onAdd: (p: ProdItem, el: HTMLElement) => void; onOpen: (p: ProdItem) => void }) {
  const config = useThemeConfig();
  return (
    <Glass interactive onClick={() => onOpen(p)} style={{ borderRadius: 18, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative', aspectRatio: '1.25', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
        <ProductArt p={p} icon={icon} />
        {config.showTags && p.tags && p.tags.length > 0 && (
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {p.tags.slice(0, 2).map((t) => <Tag key={t} label={t} small />)}
          </div>
        )}
      </div>
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, lineHeight: 1.12, color: 'var(--u-text)', flex: 1 }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Price amount={p.price} size={15} />
          {ordersEnabled && <AddControl p={p} qty={qty} onAdd={onAdd} />}
        </div>
      </div>
    </Glass>
  );
}

function ProductRow({ p, icon, qty, ordersEnabled, onAdd, onOpen }: { p: ProdItem; icon: string; qty: number; ordersEnabled: boolean; onAdd: (p: ProdItem, el: HTMLElement) => void; onOpen: (p: ProdItem) => void }) {
  const config = useThemeConfig();
  return (
    <Glass interactive onClick={() => onOpen(p)} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 13, alignItems: 'center', cursor: 'pointer' }}>
      <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.03)', position: 'relative' }}>
        <ProductArt p={p} icon={icon} scale={0.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--u-text)' }}>{p.name}</div>
          {config.showTags && p.tags?.[0] && <Tag label={p.tags[0]} small />}
        </div>
        {p.description && (
          <div className="line-clamp-2" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.35 }}>{p.description}</div>
        )}
        <Price amount={p.price} size={15} />
      </div>
      {ordersEnabled && <AddControl p={p} qty={qty} onAdd={onAdd} />}
    </Glass>
  );
}
