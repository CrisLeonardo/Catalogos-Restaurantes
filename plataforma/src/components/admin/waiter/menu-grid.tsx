'use client';

/* ── La carta, en rejilla ──────────────────────────────────────
   Las tarjetas de plato con sus categorías encima. Era una VISTA
   entera del panel del mesero (`view === 'menu'`), a la que se llegaba
   desde un botón secundario al fondo de la pantalla de la mesa —y, una
   vez dentro, la cuenta desaparecía: se apuntaba a ciegas y había que
   ir a otra pantalla más («Revisar») para comprobar qué llevaba el
   pedido.

   Desde el rediseño de 2026-09-09 esto ES el cuerpo de la pantalla de
   la mesa: lo primero que se ve al abrirla, con la cuenta a un tirón de
   la gaveta de abajo. Es lo que hacen Toast y Lightspeed en un aparato
   de mano, y lo que quita de en medio dos de las seis vistas.

   Tocar la tarjeta agrega UNA unidad. Las cantidades grandes son cosa
   del buscador («3 lim» + Enter), que además no obliga a encontrar el
   plato con la vista. */

import { Icon, ICON_PATHS } from '@/components/icons';
import type { Category, Product, ProductOptionGroup } from '@/types';

export default function MenuGrid({
  products, categories, activeCat, onActiveCat, qtyOf, onPick, onDec, money,
}: {
  products: Product[];
  categories: Category[];
  /** `null` = todas. */
  activeCat: string | null;
  onActiveCat: (id: string | null) => void;
  qtyOf: (productId: string) => number;
  /** El padre decide si esto mete el plato al carrito o abre sus opciones. */
  onPick: (product: Product, qty: number) => void;
  onDec: (productId: string) => void;
  money: (n: number) => string;
}) {
  /* Navegando por categorías el agotado NO sale: llenaría la rejilla de
     platos que no se pueden pedir. Al BUSCARLO sí sale, apagado, porque
     ahí la pregunta es justo si se acabó (ver `buscarPlatos`). */
  const visibles = products.filter((p) => {
    if (!p.is_active || !p.is_available) return false;
    if (activeCat !== null) return p.category_id === activeCat;
    return true;
  });

  const cats = categories.filter((c) => c.is_active);

  return (
    <div className="wp-menu">
      {cats.length > 0 && (
        <div className="wp-cats" role="tablist" aria-label="Categorías de la carta">
          <button
            type="button"
            role="tab"
            aria-selected={activeCat === null}
            onClick={() => onActiveCat(null)}
            className="press"
            data-on={activeCat === null ? '1' : '0'}
          >
            Todos
          </button>
          {cats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={activeCat === cat.id}
              onClick={() => onActiveCat(cat.id)}
              className="press"
              data-on={activeCat === cat.id ? '1' : '0'}
            >
              {cat.icon && (
                ICON_PATHS[cat.icon]
                  ? <Icon name={cat.icon} size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                  : <span style={{ marginRight: 4 }}>{cat.icon}</span>
              )}{cat.name}
            </button>
          ))}
        </div>
      )}

      {visibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
          {activeCat === null
            ? 'No hay platos disponibles ahora mismo.'
            : 'Nada disponible en esta categoría.'}
        </div>
      ) : (
        <div className="waiter-menu-grid">
          {visibles.map((p) => {
            const qty = qtyOf(p.id);
            const hasOptions = ((p.options as ProductOptionGroup[] | null) ?? []).length > 0;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onPick(p, 1)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p, 1); } }}
                className="press glass wp-dish"
                data-on={qty > 0 ? '1' : '0'}
              >
                {qty > 0 && <span className="wp-dish-qty">{qty}</span>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--u-text)' }}>
                  {p.icon && (
                    ICON_PATHS[p.icon]
                      ? <Icon name={p.icon} size={23} />
                      : <span style={{ fontSize: 23 }}>{p.icon}</span>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, paddingRight: qty > 0 ? 24 : 0 }}>{p.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-accent-ink)' }}>{money(p.price)}</span>
                </div>

                {hasOptions ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPick(p, 1); }} className="press wp-dish-act">
                    {qty > 0 ? 'Agregar otro' : '+ Elegir opciones'}
                  </button>
                ) : qty > 0 ? (
                  <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDec(p.id); }} className="press wp-dish-step" aria-label={`Quitar uno de ${p.name}`}>−</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onPick(p, 1); }} className="press wp-dish-step" aria-label={`Agregar otro ${p.name}`}>+</button>
                  </div>
                ) : (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPick(p, 1); }} className="press wp-dish-act" data-primary="1">
                    + Agregar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
