'use client';

/* ============================================================
   CHECKOUT CON EL CARRITO VACÍO (auditoría 2026-10-02, CAT-09)
   ------------------------------------------------------------
   Antes: «Tu carrito está vacío» y un botón al menú. Quien llega
   aquí (un enlace guardado, el carrito que caducó, volver atrás
   después de pedir) ya quería pedir: se le ofrece «Lo más pedido»
   con su «+». Al tocar uno, el carrito deja de estar vacío y el
   checkout aparece solo, con ese platillo. Solo platillos de un
   toque (sin opciones que elegir): los demás se piden desde la carta.
   ============================================================ */

import { Icon } from '@/components/icons';
import { PrimaryButton, Price } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeContent } from '@/lib/theme/context';
import type { Sugerencia } from '@/components/menu/pairings';

export default function EmptyCart({ sugeridos, menuHref }: { sugeridos: Sugerencia[]; menuHref: string }) {
  const content = useThemeContent();
  const { addItem } = useCart();

  return (
    <main className="themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-6) var(--m-sp-5)', textAlign: 'center', maxWidth: 380, width: '100%' }}>
        <Icon name="bag" size={44} strokeWidth={1.3} style={{ color: 'var(--u-text-4)', margin: '0 auto 16px' }} />
        <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 10 }}>{content.cart.empty}</h2>

        {sugeridos.length > 0 && (
          <div style={{ textAlign: 'left', margin: '18px 0 20px' }}>
            <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', marginBottom: 'var(--m-sp-2)' }}>Lo más pedido</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-2)' }}>
              {sugeridos.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--m-sp-3)', borderTop: '1px solid var(--u-hair)', paddingTop: 'var(--m-sp-2)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ct-product-name m-name">{s.name}</div>
                    <Price amount={s.price} size={14} style={{ marginTop: 2 }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem({ productId: s.id, name: s.name, price: s.price, image_url: s.image_url ?? null })}
                    className="press m-tap"
                    aria-label={`Agregar ${s.name}`}
                    style={{ borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', color: 'var(--u-text)', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <PrimaryButton href={menuHref}>{content.cart.emptyCta}</PrimaryButton>
      </div>
    </main>
  );
}
