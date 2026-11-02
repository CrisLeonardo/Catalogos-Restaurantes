import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getPublicOrder } from '@/lib/actions/orders';
import OrderTracker from '@/components/order-tracker';

/* ============================================================
   /pedido/[token] — Seguimiento público del pedido
   ------------------------------------------------------------
   El comensal llega aquí desde la confirmación del checkout.
   El token es un UUID opaco que solo conoce él; la página
   muestra el estado en vivo sin exponer teléfono ni dirección.
   Vive en el subdominio del restaurante → usa su tema completo.
   ============================================================ */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Seguimiento de pedido',
  robots: { index: false, follow: false },
};

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) notFound();

  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const order = await getPublicOrder(token, data.restaurant.id);
  if (!order) notFound();

  return (
    <ThemeProvider config={data.resolved.config} content={data.resolved.content}>
      <OrderTracker
        token={token}
        restaurantId={data.restaurant.id}
        initialOrder={order}
        whatsapp={data.restaurant.orders_whatsapp || data.restaurant.whatsapp_number}
      />
    </ThemeProvider>
  );
}
