'use client';

import { useEffect } from 'react';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import Portada from '@/components/menu/portada';
import MenuClient from '@/components/menu-client';
import VisitTracker from '@/components/visit-tracker';
import InstallBanner from '@/components/install-banner';
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
  /** Mesa pre-seleccionada desde el QR de la mesa. */
  initialMesa?: number;
}

export default function MenuShell({ config, content, categories, products, restaurantId, ordersEnabled, isOpen = true, initialMesa }: Props) {
  useEffect(() => {
    if (initialMesa && initialMesa > 0) {
      try {
        localStorage.setItem(`qr-mesa-${restaurantId}`, String(initialMesa));
      } catch {}
    }
  }, [initialMesa, restaurantId]);

  return (
    <ThemeProvider config={config} content={content}>
      <CartProvider restaurantId={restaurantId}>
        <VisitTracker restaurantId={restaurantId} />
        <main style={{ width: '100%', maxWidth: 460, margin: '0 auto', padding: '0 16px 64px' }}>
          <Portada isOpen={isOpen} />
          <div id="menu" style={{ scrollMarginTop: 16, paddingTop: 12 }}>
            <MenuClient categories={categories} products={products} ordersEnabled={ordersEnabled} restaurantId={restaurantId} />
          </div>
        </main>
        <InstallBanner brandName={config.brandName} />
      </CartProvider>
    </ThemeProvider>
  );
}
