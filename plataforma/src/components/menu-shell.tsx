'use client';

import { CartProvider } from '@/lib/cart-context';
import MenuClient from '@/components/menu-client';
import type { Category, Product } from '@/types';

type CatItem  = Pick<Category, 'id' | 'name' | 'icon'>;
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'>;

interface Props {
  categories:    CatItem[];
  products:      ProdItem[];
  restaurantId:  string;
  ordersEnabled: boolean;
}

export default function MenuShell({
  categories,
  products,
  restaurantId,
  ordersEnabled,
}: Props) {
  return (
    <CartProvider restaurantId={restaurantId}>
      <MenuClient
        categories={categories}
        products={products}
        ordersEnabled={ordersEnabled}
        restaurantId={restaurantId}
      />
    </CartProvider>
  );
}
