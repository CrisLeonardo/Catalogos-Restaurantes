import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import ImportarCarta from '@/components/admin/importar-carta';

export const metadata = { title: 'Importar carta – Panel admin' };

/* Importar una carta (ficha 2.4). La página trae la carta actual para
   comparar en la revisión; la acción del servidor la vuelve a leer al
   publicar, así que esto es solo para enseñar qué pasará. */
export default async function ImportarCartaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'catalogo')) redirect('/admin');

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const { data } = await createServiceClient()
    .from('products').select('id, name, price').eq('restaurant_id', restaurantId).limit(5000);

  return (
    <div className="anim-fade-up">
      <ImportarCarta
        restaurantId={restaurantId}
        existentes={(data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, price: Number(p.price) }))}
      />
    </div>
  );
}
