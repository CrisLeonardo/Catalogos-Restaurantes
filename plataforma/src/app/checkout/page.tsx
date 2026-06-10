import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { isOpenNow } from '@/lib/hours';
import CheckoutForm from '@/components/checkout-form';
import CheckoutBlocked from '@/components/checkout-blocked';

export const metadata: Metadata = { title: 'Hacer pedido' };

export default async function CheckoutPage() {
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) notFound();

  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const { restaurant, resolved } = data;
  const modules = restaurant.modules as { orders?: boolean } | null;

  if (!modules?.orders || restaurant.status !== 'active') notFound();

  // Operación: pausa manual ("cocina saturada") y horario real.
  // createOrder vuelve a validar en el servidor; esto es solo la UX.
  const paused = restaurant.orders_paused === true;
  const open = isOpenNow(restaurant.hours, restaurant.timezone || 'America/Guatemala');

  if (paused || !open) {
    return (
      <ThemeProvider config={resolved.config} content={resolved.content}>
        <CheckoutBlocked
          reason={paused ? 'paused' : 'closed'}
          pauseMessage={restaurant.pause_message}
        />
      </ThemeProvider>
    );
  }

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
