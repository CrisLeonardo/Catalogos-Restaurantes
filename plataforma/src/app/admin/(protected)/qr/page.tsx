import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { stableMenuSlugUrl, subdomainUrl } from '@/lib/tenant';
import { frasesDelCartel } from '@/lib/qr-material';
import QRDisplay from '@/components/admin/qr-display';

export const metadata = { title: 'Código QR – Panel admin' };

/* Código QR (ficha 2.10): el título lo pone la barra de arriba. Lo que
   el cartel puede prometer sale de lo que el restaurante tiene encendido. */
export default async function QRPage() {
  const ctx = await getAdminContext();
  const slug = (await headers()).get('x-tenant-slug') ?? ctx?.restaurant?.slug ?? null;
  const data = slug ? await getRestaurantBySlug(slug) : null;

  if (!slug || !data) {
    return (
      <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
        No encontramos la dirección de tu carta. Escríbenos desde Ayuda y lo revisamos.
      </p>
    );
  }

  const { restaurant, resolved } = data;
  // Los módulos, de la sesión (al día); los de la carta pueden venir de caché.
  const fuente = ctx?.restaurant?.id === restaurant.id ? ctx.restaurant : restaurant;
  const modules = (fuente.modules ?? {}) as Record<string, boolean>;
  const frases = frasesDelCartel({ pedidos: modules.orders === true, orderTypes: resolved.config.orderTypes ?? [] });

  return (
    <QRDisplay
      restaurantName={restaurant.name}
      restaurantId={restaurant.id}
      accent={resolved.config.colorAccent || '#D97757'}
      hasLogo={!!resolved.config.logoUrl}
      urlEstable={stableMenuSlugUrl(restaurant.slug)}
      enlaceCorto={subdomainUrl(restaurant.slug)}
      frases={frases}
    />
  );
}
