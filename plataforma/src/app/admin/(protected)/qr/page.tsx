import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import QRDisplay from '@/components/admin/qr-display';

export const metadata = { title: 'Código QR — Panel Admin' };

export default async function QRPage() {
  const ctx = await getAdminContext();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Resolve restaurant
  let restaurantId: string | null = null;
  let restaurantName = 'Mi restaurante';

  if (tenantSlug) {
    const data = await getRestaurantBySlug(tenantSlug);
    if (data) {
      restaurantName = data.restaurant.name;
      restaurantId = data.restaurant.id;
    }
  } else if (ctx?.restaurant) {
    restaurantName = ctx.restaurant.name;
    restaurantId = ctx.restaurant.id;
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--u-text)',
            marginBottom: 4,
          }}
        >
          Código QR
        </h1>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
          Comparte el acceso directo a tu menú
        </p>
      </div>

      {restaurantId ? (
        <QRDisplay restaurantName={restaurantName} restaurantId={restaurantId} />
      ) : (
        <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
          No se pudo determinar la URL del menú. Verifica que el restaurante
          tenga un slug asignado.
        </p>
      )}
    </div>
  );
}
