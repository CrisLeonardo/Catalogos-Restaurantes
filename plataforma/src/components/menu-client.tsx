'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Glass, Price, Tag } from '@/components/glass';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<
  Product,
  'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'
>;

interface Props {
  categories: CatItem[];
  products: ProdItem[];
}

export default function MenuClient({ categories, products }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProdItem | null>(null);

  const filtered =
    activeCategory ? products.filter((p) => p.category_id === activeCategory) : products;

  return (
    <>
      {/* Tabs de categoría */}
      <div
        style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          paddingBottom: 18, scrollbarWidth: 'none',
        }}
      >
        <CategoryTab
          label="Todos"
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {categories.map((cat) => (
          <CategoryTab
            key={cat.id}
            label={cat.name}
            active={activeCategory === cat.id}
            onClick={() => setActiveCategory(cat.id)}
          />
        ))}
      </div>

      {/* Cuadrícula de productos */}
      {filtered.length === 0 ? (
        <p
          className="t-mute"
          style={{ textAlign: 'center', padding: '40px 0', fontSize: 14 }}
        >
          Sin productos en esta categoría.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {/* Modal de detalle */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}

/* ── Componentes internos ──────────────────────────────────── */

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="press"
      style={{
        flex: '0 0 auto',
        padding: '9px 16px',
        borderRadius: 'var(--radius-full)',
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
        border: active ? 'none' : '1px solid var(--u-hair)',
        background: active ? 'var(--brand-text)' : 'rgba(255,255,255,0.05)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
        transition: 'background 180ms, color 180ms',
      }}
    >
      {label}
    </button>
  );
}

function ProductCard({
  product,
  onClick,
}: {
  product: ProdItem;
  onClick: () => void;
}) {
  const firstTag = product.tags?.[0] ?? null;

  return (
    <Glass
      interactive
      onClick={onClick}
      style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
    >
      {/* Imagen / placeholder */}
      <div
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 440px) 50vw, 200px"
          />
        ) : firstTag ? (
          <Tag label={firstTag} />
        ) : (
          <span className="t-mute" style={{ fontSize: 11 }}>foto</span>
        )}
      </div>

      {/* Nombre */}
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', lineHeight: 1.3 }}>
        {product.name}
      </h3>

      {/* Descripción (2 líneas max) */}
      <p
        className="t-mute line-clamp-2"
        style={{ fontSize: 11.5, lineHeight: 1.4, flex: 1 }}
      >
        {product.description}
      </p>

      {/* Precio + botón */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Price amount={product.price} />
        <button
          className="press btn-white"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          style={{
            width: 30, height: 30,
            borderRadius: 'var(--radius-full)',
            fontSize: 18, lineHeight: 1,
            cursor: 'pointer', border: 'none',
          }}
          aria-label={`Ver detalle de ${product.name}`}
        >
          +
        </button>
      </div>
    </Glass>
  );
}

function ProductModal({
  product,
  onClose,
}: {
  product: ProdItem;
  onClose: () => void;
}) {
  // Bloquea el scroll del body mientras el modal está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Panel (bottom sheet) */}
      <div
        className="glass anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 440,
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: '24px 20px 48px',
          maxHeight: '85dvh',
          overflowY: 'auto',
        }}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="press"
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32,
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid var(--u-hair-2)',
            color: 'var(--u-text)',
            fontSize: 20, lineHeight: 1,
            cursor: 'pointer',
          }}
          aria-label="Cerrar"
        >
          ×
        </button>

        {/* Imagen / placeholder */}
        <div
          style={{
            width: '100%', aspectRatio: '16 / 9',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
            display: 'grid', placeItems: 'center',
            marginBottom: 20,
          }}
        >
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              style={{ objectFit: 'cover' }}
              sizes="440px"
            />
          ) : (
            product.tags?.[0] && <Tag label={product.tags[0]} />
          )}
        </div>

        {/* Etiquetas */}
        {product.tags && product.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {product.tags.map((tag) => <Tag key={tag} label={tag} />)}
          </div>
        )}

        {/* Nombre */}
        <h2
          className="t-display"
          style={{ fontSize: 'var(--fs-h1)', marginBottom: 10, paddingRight: 40 }}
        >
          {product.name}
        </h2>

        {/* Descripción */}
        {product.description && (
          <p className="t-mute" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 22 }}>
            {product.description}
          </p>
        )}

        {/* Precio */}
        <Price amount={product.price} size={22} />
      </div>
    </div>
  );
}
