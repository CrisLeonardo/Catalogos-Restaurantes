import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import AdminNav from '@/components/admin/nav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sin Supabase configurado → redirect al home (demo mode)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/');
  }

  // Verificar sesión activa
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Obtener contexto admin (profile + restaurant)
  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');

  const { profile } = ctx;

  // Obtener tenant actual desde subdominio
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  let restaurantName = 'Panel admin';

  if (profile.role === 'SUPER_ADMIN') {
    // SUPER_ADMIN puede acceder al panel de cualquier restaurante
    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      restaurantName = tenantData?.restaurant.name ?? 'Panel admin';
    }
  } else {
    // OWNER / STAFF: deben pertenecer al tenant actual
    if (!profile.restaurant_id) redirect('/login');

    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      if (!tenantData || tenantData.restaurant.id !== profile.restaurant_id) {
        redirect('/');
      }
      restaurantName = tenantData.restaurant.name;
    } else {
      // Sin subdominio: el dueño accede desde el dominio raíz (dev)
      restaurantName = ctx.restaurant?.name ?? 'Panel admin';
    }
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <AdminNav restaurantName={restaurantName} />
      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}
