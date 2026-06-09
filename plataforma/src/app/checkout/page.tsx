import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import CheckoutForm from '@/components/checkout-form';

export const metadata: Metadata = { title: 'Hacer pedido' };

export default async function CheckoutPage() {
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) notFound();

  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const { restaurant, resolved } = data;
  const modules = restaurant.modules as { orders?: boolean } | null;

  if (!modules?.orders || restaurant.status !== 'active') notFound();

  return (
    <ThemeProvider config={resolved.config} content={resolved.content}>
      <CartProvider restaurantId={restaurant.id}>
        <CheckoutForm
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          whatsappNumber={restaurant.whatsapp_number}
        />
      </CartProvider>
    </ThemeProvider>
  );
}
