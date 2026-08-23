import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/admin/profile-form';
import { Icon } from '@/components/icons';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Perfil – Panel admin' };

export default async function AdminPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const sp = await searchParams;
  const saved = sp.saved === '1';

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  // Cargar datos del restaurante
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) redirect('/admin/login');

  return (
    <div className="anim-fade-up max-w-[720px]">
      {/* El título lo pone la barra de arriba ("Perfil"). Escribirlo otra vez
          diez píxeles más abajo no informaba: solo empujaba el formulario. */}
      {saved && (
        <div className="note note-ok" style={{ marginBottom: 18 }}>
          <Icon name="checkCircle" size={16} /> Cambios guardados
        </div>
      )}

      <ProfileForm
        restaurantId={restaurantId}
        restaurant={restaurant as Restaurant}
      />

    </div>
  );
}
