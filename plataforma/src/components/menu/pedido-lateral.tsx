'use client';

/* ============================================================
   «TU PEDIDO» A LA VISTA EN PC (auditoría «La carta que vende», CV-19)
   ------------------------------------------------------------
   En PC la carta era la columna del teléfono en medio de un fondo
   vacío. Sin estirar las tarjetas (la carta conserva su ancho), el
   hueco de la derecha lleva el pedido siempre visible: qué llevas,
   cuánto va y el paso siguiente. Solo aparece cuando cabe junto a la
   carta (globals.css, `.m-pedido-lateral`); en el teléfono no existe.
   ============================================================ */

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useTenantPrefix } from '@/lib/tenant-client';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';

export default function PedidoLateral({ onVer }: { onVer: () => void }) {
  const { items, total, count } = useCart();
  const config = useThemeConfig();
  const content = useThemeContent();
  const checkoutHref = useTenantPrefix('/checkout');
  return (
    <aside className="m-pedido-lateral m-surface" aria-labelledby="pedido-lateral-t">
      <h2 id="pedido-lateral-t" style={{ margin: 0, fontSize: 'var(--m-fs-lg)', fontWeight: 700 }}>Tu pedido</h2>
      {count === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="bag" size={16} /> Todavía vacío. Toca «+» en un platillo.
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
            {items.map((i) => (
              <li key={i.lineId} style={{ display: 'flex', gap: 8, fontSize: 'var(--m-fs-sm)' }}>
                <span style={{ color: 'var(--u-text-3)', fontVariantNumeric: 'tabular-nums' }}>{i.quantity}×</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {i.name}
                  {i.options && i.options.length > 0 && (
                    <span style={{ display: 'block', fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)' }}>{i.options.map((o) => o.choiceName).join(' · ')}</span>
                  )}
                </span>
                <span className="ct-price" style={{ whiteSpace: 'nowrap' }}>{formatPrice(i.price * i.quantity, config)}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--u-hair)', paddingTop: 10, fontWeight: 700 }}>
            <span>Total</span>
            <span className="ct-price" style={{ fontSize: 'var(--m-fs-lg)' }}>{formatPrice(total, config)}</span>
          </div>
          {/* El panel ya enseña el pedido: su botón lleva directo al pago, no
              repite el «Ver carrito» de la barra. Cambiar algo: la barra. */}
          <Link href={checkoutHref} className={`press ${config.ctaStyle === 'accent' ? 'btn-accent' : 'btn-white'}`}
            style={{ minHeight: 48, borderRadius: 'var(--m-r-lg)', fontWeight: 700, fontSize: 'var(--m-fs-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            {content.cart.checkout}
          </Link>
          <button type="button" onClick={onVer} className="press"
            style={{ minHeight: 40, border: 'none', background: 'none', color: 'var(--u-text-3)', fontSize: 'var(--m-fs-sm)', textDecoration: 'underline', cursor: 'pointer' }}>
            Cambiar algo
          </button>
        </>
      )}
    </aside>
  );
}
