import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import MyOrders from '@/components/my-orders';

/* ============================================================
   /mis-pedidos — historial del comensal (por dispositivo)
   ------------------------------------------------------------
   No requiere cuenta: los pedidos se recuerdan en el dispositivo
   al confirmarlos y aquí se consulta su estado real.
   ============================================================ */

export const metadata: Metadata = {
  title: 'Mis pedidos',
  robots: { index: false, follow: false },
};

export default async function MisPedidosPage() {
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) notFound();

  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const modules = data.restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders) notFound();

  return (
    <ThemeProvider config={data.resolved.config} content={data.resolved.content}>
      <MyOrders restaurantId={data.restaurant.id} />
    </ThemeProvider>
  );
}
