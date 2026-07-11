import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getKitchenOrders } from '@/lib/db/orders';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import KitchenDisplay from '@/components/admin/kitchen-display';

export const metadata = { title: 'Cocina (KDS)' };

export default async function CocinaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const slug = (await headers()).get('x-tenant-slug');

  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  // SUPER_ADMIN no tiene restaurant_id propio: lo resolvemos del slug de tenant.
  let restaurantId = (profile?.restaurant_id as string | null) ?? null;
  if (!restaurantId && profile?.role === 'SUPER_ADMIN' && slug) {
    const tenant = await getRestaurantBySlug(slug);
    restaurantId = tenant?.restaurant.id ?? null;
  }
  if (!restaurantId) redirect('/admin/login');

  let restaurantName = 'Cocina';
  if (slug) {
    const tenant = await getRestaurantBySlug(slug);
    if (tenant) restaurantName = tenant.restaurant.name;
  } else {
    const { data: r } = await db.from('restaurants').select('name').eq('id', restaurantId).single();
    restaurantName = (r?.name as string | null) ?? 'Cocina';
  }

  const { data: themeRow } = await db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single();
  const cfg = resolveTheme((themeRow as ThemeRow) ?? null).config;
  const orders = await getKitchenOrders(restaurantId, cfg.kdsConfirmFirst);

  // Sigue el switch claro/oscuro del panel admin (cookie `admin-theme`), NO
  // el tema del restaurante — la paleta de alto contraste del KDS es fija
  // para legibilidad, pero antes ignoraba también este switch y se quedaba
  // siempre oscura.
  const scheme = (await cookies()).get('admin-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <KitchenDisplay
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      initialOrders={orders}
      yellowMin={cfg.kdsYellowMin}
      redMin={cfg.kdsRedMin}
      confirmFirst={cfg.kdsConfirmFirst}
      scheme={scheme}
    />
  );
}
