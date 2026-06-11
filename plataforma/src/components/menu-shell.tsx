'use client';

import Link from 'next/link';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import Portada from '@/components/menu/portada';
import MenuClient from '@/components/menu-client';
import ActiveOrderChip from '@/components/active-order-chip';
import VisitTracker from '@/components/visit-tracker';
import { Icon } from '@/components/icons';
import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'>;

interface Props {
  config: ThemeConfig;
  content: ThemeContent;
  categories: CatItem[];
  products: ProdItem[];
  restaurantId: string;
  ordersEnabled: boolean;
  /** Estado real según horarios del restaurante (default: abierto). */
  isOpen?: boolean;
}

export default function MenuShell({ config, content, categories, products, restaurantId, ordersEnabled, isOpen = true }: Props) {
  return (
    <ThemeProvider config={config} content={content}>
      <CartProvider restaurantId={restaurantId}>
        <VisitTracker restaurantId={restaurantId} />
        <main style={{ width: '100%', maxWidth: 460, margin: '0 auto', padding: '0 16px 64px' }}>
          <Portada isOpen={isOpen} />
          <div id="menu" style={{ scrollMarginTop: 16, paddingTop: 12 }}>
            <MenuClient categories={categories} products={products} ordersEnabled={ordersEnabled} />
          </div>
          {ordersEnabled && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
              <Link
                href="/mis-pedidos"
                className="press glass-quiet"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 99, textDecoration: 'none',
                  fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)',
                }}
              >
                <Icon name="receipt" size={15} /> Mis pedidos
              </Link>
            </div>
          )}
        </main>
        {ordersEnabled && <ActiveOrderChip restaurantId={restaurantId} />}
      </CartProvider>
    </ThemeProvider>
  );
}
