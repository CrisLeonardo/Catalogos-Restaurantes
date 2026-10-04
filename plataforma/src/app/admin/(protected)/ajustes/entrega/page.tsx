import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import DeliveryZonesEditor from '@/components/admin/delivery-zones-editor';
import { getDeliveryZones } from '@/lib/db/zones';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Zona de entrega – Panel admin' };

/* /admin/ajustes/entrega — dónde estás, hasta dónde repartes y cuánto
   cobras por zona. Salió del acordeón "Mapa de entrega (por radio)" de la
   pantalla de horarios: no tiene nada que ver con a qué hora abres.

   Las zonas con su tarifa vivían en Repartidores, una pantalla que no está
   en ningún menú: la entrega se configuraba en dos sitios y uno no se
   encontraba (auditoría 2026-10-02, N-03). Ahora está todo aquí. */

export default async function AdminEntregaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const supabase = await createClient();
  const [{ data: restaurant }, zones] = await Promise.all([
    supabase.from('restaurants').select('*').eq('id', restaurantId).single(),
    getDeliveryZones(restaurantId),
  ]);

  if (!restaurant) redirect('/admin/login');

  return (
    <div className="anim-fade-up adm-w-read">
      <p className="mb-5 text-[14px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        Marca dónde está tu local y hasta dónde repartes. El cliente pone su pin
        en el mapa al pagar, y el pedido se rechaza si cae fuera del radio.
      </p>
      <RestaurantLocationEditor restaurant={restaurant as Restaurant} />
      <div style={{ marginTop: 28 }}>
        <DeliveryZonesEditor
          restaurantId={restaurantId}
          initialZones={zones.map((z) => ({ nombre: z.nombre, tarifa: z.tarifa }))}
        />
      </div>
    </div>
  );
}
