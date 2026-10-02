import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import HoursEditor from '@/components/admin/hours-editor';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Horarios – Panel admin' };

/* ============================================================
   /admin/ajustes/restaurante — Horarios
   ------------------------------------------------------------
   Esta pantalla se llamaba "Horarios y preferencias" y era cinco
   acordeones: este dispositivo, horario, mapa de entrega, idiomas
   y un quinto —"Pedidos y moneda"— que por dentro tenía tarjeta,
   propina, confirmación automática, semáforo de cocina, moneda,
   locale y animaciones. Trece ajustes sin relación detrás de un
   título que no los nombraba, y cuatro de los cinco plegados: la
   pantalla abría sin enseñar nada.

   Ahora cada cosa tiene su pantalla y la portada de Ajustes las
   lista. Aquí queda SOLO el horario. La ruta no se movió: los
   tours guiados y los enlaces viejos siguen valiendo.
   ============================================================ */

export default async function AdminHorariosPage() {
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
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) redirect('/admin/login');

  return (
    <div className="anim-fade-up max-w-[720px]">
      <p className="mb-5 text-[14px] leading-snug" style={{ color: 'var(--u-text-3)' }}>
        Cuándo abres cada día, y el interruptor para dejar de recibir pedidos
        sin cerrar tu menú.
      </p>
      <HoursEditor restaurant={restaurant as Restaurant} />
    </div>
  );
}
