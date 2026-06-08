'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Glass, Price, Tag } from '@/components/glass';
import { useCart } from '@/lib/cart-context';
import type { Category, Product } from '@/types';

type CatItem  = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<
  Product,
  'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'
>;

interface Props {
  categories:    CatItem[];
  products:      ProdItem[];
  ordersEnabled?: boolean;
  restaurantId?:  string;
}

export default function MenuClient({
  categories,
  products,
  ordersEnabled = false,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProdItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const filtered = activeCategory
    ? products.filter((p) => p.category_id === activeCategory)
    : products;

  function openProduct(p: ProdItem) {
    setCartOpen(false);
    setSelectedProduct(p);
  }

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
        <p className="t-mute" style={{ textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
          Sin productos en esta categoría.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => openProduct(product)}
            />
          ))}
        </div>
      )}

      {/* Espaciado extra cuando la barra de carrito está visible */}
      {ordersEnabled && <div style={{ height: 72 }} />}

      {/* Modal de detalle */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          ordersEnabled={ordersEnabled}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Barra inferior del carrito (solo si ordersEnabled) */}
      {ordersEnabled && (
        <CartBar onOpen={() => setCartOpen(true)} />
      )}

      {/* Panel del carrito */}
      {ordersEnabled && cartOpen && (
        <CartPanel onClose={() => setCartOpen(false)} />
      )}
    </>
  );
}

/* ── Category Tab ──────────────────────────────────────────── */

function CategoryTab({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
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
        border:      active ? 'none' : '1px solid var(--u-hair)',
        background:  active ? 'var(--brand-text)' : 'rgba(255,255,255,0.05)',
        color:       active ? 'var(--brand-bg)' : 'var(--u-text-2)',
        transition:  'background 180ms, color 180ms',
      }}
    >
      {label}
    </button>
  );
}

/* ── Product Card ──────────────────────────────────────────── */

function ProductCard({
  product, onClick,
}: { product: ProdItem; onClick: () => void }) {
  const firstTag = product.tags?.[0] ?? null;

  return (
    <Glass
      interactive
      onClick={onClick}
      style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
    >
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

      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', lineHeight: 1.3 }}>
        {product.name}
      </h3>

      <p className="t-mute line-clamp-2" style={{ fontSize: 11.5, lineHeight: 1.4, flex: 1 }}>
        {product.description}
      </p>

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

/* ── Product Modal ─────────────────────────────────────────── */

function ProductModal({
  product, ordersEnabled, onClose,
}: { product: ProdItem; ordersEnabled: boolean; onClose: () => void }) {
  const { addItem } = useCart();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleAdd() {
    addItem({
      productId: product.id,
      name:      product.name,
      price:     product.price,
      image_url: product.image_url,
    });
    onClose();
  }

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
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

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

        {/* Imagen */}
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

        {product.tags && product.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {product.tags.map((tag) => <Tag key={tag} label={tag} />)}
          </div>
        )}

        <h2
          className="t-display"
          style={{ fontSize: 'var(--fs-h1)', marginBottom: 10, paddingRight: 40 }}
        >
          {product.name}
        </h2>

        {product.description && (
          <p className="t-mute" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 22 }}>
            {product.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Price amount={product.price} size={22} />
          {ordersEnabled && (
            <button
              onClick={handleAdd}
              className="press btn-accent"
              style={{
                flex: 1, maxWidth: 200,
                padding: '13px 20px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 14,
                cursor: 'pointer', border: 'none',
                color: '#fff',
              }}
            >
              Agregar al carrito
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Cart Bar (sticky bottom) ──────────────────────────────── */

function CartBar({ onOpen }: { onOpen: () => void }) {
  const { count, total } = useCart();

  if (count === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 40,
        display: 'flex', justifyContent: 'center',
        padding: '0 16px 16px',
        pointerEvents: 'none',
      }}
    >
      <button
        onClick={onOpen}
        className="press glass-solid anim-slide-up"
        style={{
          pointerEvents: 'auto',
          width: '100%', maxWidth: 440,
          padding: '14px 20px',
          borderRadius: 'var(--radius-full)',
          cursor: 'pointer',
          border: '1px solid var(--u-hair-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            background: 'var(--brand-accent)',
            color: '#fff',
            borderRadius: 'var(--radius-full)',
            padding: '3px 9px',
            fontSize: 12, fontWeight: 700,
            minWidth: 22, textAlign: 'center',
          }}
        >
          {count}
        </span>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>
          Ver carrito
        </span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
          ${total.toFixed(0)}
        </span>
      </button>
    </div>
  );
}

/* ── Cart Panel (bottom sheet) ─────────────────────────────── */

function CartPanel({ onClose }: { onClose: () => void }) {
  const { items, removeItem, updateQuantity, total } = useCart();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Carrito de compras"
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      <div
        className="glass anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 440,
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: '24px 20px 40px',
          maxHeight: '85dvh',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)' }}>
            Tu pedido
          </h2>
          <button
            onClick={onClose}
            className="press"
            style={{
              width: 32, height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid var(--u-hair-2)',
              color: 'var(--u-text)',
              fontSize: 20, lineHeight: 1, cursor: 'pointer',
            }}
            aria-label="Cerrar carrito"
          >
            ×
          </button>
        </div>

        {/* Lista de items */}
        {items.length === 0 ? (
          <p className="t-mute" style={{ textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
            El carrito está vacío.
          </p>
        ) : (
          <div
            style={{
              overflowY: 'auto', flex: 1,
              display: 'flex', flexDirection: 'column', gap: 12,
              marginBottom: 20,
            }}
          >
            {items.map((item) => (
              <div
                key={item.productId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--u-hair)',
                }}
              >
                {/* Controles de cantidad */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="press"
                    style={{
                      width: 26, height: 26,
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid var(--u-hair)',
                      color: 'var(--u-text)',
                      fontSize: 16, lineHeight: 1, cursor: 'pointer',
                    }}
                    aria-label={item.quantity === 1 ? `Eliminar ${item.name}` : `Reducir ${item.name}`}
                  >
                    {item.quantity === 1 ? '×' : '−'}
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', minWidth: 16, textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="press"
                    style={{
                      width: 26, height: 26,
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid var(--u-hair)',
                      color: 'var(--u-text)',
                      fontSize: 16, lineHeight: 1, cursor: 'pointer',
                    }}
                    aria-label={`Agregar otro ${item.name}`}
                  >
                    +
                  </button>
                </div>

                {/* Nombre */}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>
                  {item.name}
                </span>

                {/* Subtotal */}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)', flex: '0 0 auto' }}>
                  ${(item.price * item.quantity).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Total + botón de checkout */}
        {items.length > 0 && (
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: 'var(--u-text-2)' }}>Total</span>
              <span className="t-display" style={{ fontSize: 'var(--fs-h2)' }}>
                ${total.toFixed(0)}
              </span>
            </div>

            <Link
              href="/checkout"
              className="press btn-accent"
              style={{
                display: 'block', textAlign: 'center',
                padding: '14px 20px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 15,
                textDecoration: 'none', color: '#fff',
              }}
              onClick={onClose}
            >
              Hacer pedido →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
