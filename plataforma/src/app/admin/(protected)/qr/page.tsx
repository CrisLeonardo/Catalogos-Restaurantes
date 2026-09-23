import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import QRDisplay from '@/components/admin/qr-display';

export const metadata = { title: 'Código QR – Panel admin' };

export default async function QRPage() {
  const ctx = await getAdminContext();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Resolve restaurant
  let restaurantId: string | null = null;
  let restaurantName = 'Mi restaurante';
  let slug: string | null = tenantSlug;

  if (tenantSlug) {
    const data = await getRestaurantBySlug(tenantSlug);
    if (data) {
      restaurantName = data.restaurant.name;
      restaurantId = data.restaurant.id;
    }
  } else if (ctx?.restaurant) {
    restaurantName = ctx.restaurant.name;
    restaurantId = ctx.restaurant.id;
    slug = ctx.restaurant.slug;
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      {/* El título ya lo pone la barra de arriba ("Código QR"). */}
      <p style={{ fontSize: 14, color: 'var(--u-text-3)', marginBottom: 20 }}>
        Compártelo en redes o en tu bio: es el link con el que la gente pide
        en línea. Para las mesas, usa los QR de la sección Mesas.
      </p>

      {restaurantId && slug ? (
        <QRDisplay restaurantName={restaurantName} slug={slug} />
      ) : (
        <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
          No se pudo determinar la URL del menú. Verifica que el restaurante
          tenga un slug asignado.
        </p>
      )}
    </div>
  );
}
