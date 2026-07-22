import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { isOpenNow } from '@/lib/hours';
import { hasActiveCodePromos } from '@/lib/db/promos';
import { isModuleActive } from '@/lib/modules';
import { getAgentHubInfo } from '@/lib/print-agent';
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

  // BASICO solo soporta pickup. ESTANDAR y Premium+ honran sus orderTypes
  // configurados (en Estándar son los 2 de 3 modos elegidos por el dueño).
  const planActual = (restaurant.plan_actual as string | null) ?? null;
  const safeConfig = planActual === 'BASICO'
    ? { ...resolved.config, orderTypes: ['pickup' as const] }
    : resolved.config;

  // Operación: pausa manual ("cocina saturada") y horario real.
  // createOrder vuelve a validar en el servidor; esto es solo la UX.
  const paused = restaurant.orders_paused === true;
  const open = isOpenNow(restaurant.hours, restaurant.timezone || 'America/Guatemala', new Date(), restaurant.hour_exceptions);
  const hasPromos = await hasActiveCodePromos(restaurant.id);
  const { hubUrl, hubToken } = await getAgentHubInfo(restaurant.id);
  const mod = restaurant.modules as Record<string, boolean> | null;
  const modSettings = restaurant.module_settings ?? null;
  const encuestasActive = isModuleActive(mod, modSettings, 'encuestas');

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
    <ThemeProvider config={safeConfig} content={resolved.content}>
      <CartProvider restaurantId={restaurant.id}>
        <CheckoutForm
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          whatsappNumber={restaurant.orders_whatsapp || restaurant.whatsapp_number}
          deliveryZones={restaurant.delivery_zones ?? []}
          restaurantLat={restaurant.location_lat}
          restaurantLng={restaurant.location_lng}
          deliveryRadiusKm={restaurant.delivery_radius_km}
          hasPromos={hasPromos}
          encuestasActive={encuestasActive}
          hubUrl={hubUrl}
          hubToken={hubToken}
        />
      </CartProvider>
    </ThemeProvider>
  );
}
