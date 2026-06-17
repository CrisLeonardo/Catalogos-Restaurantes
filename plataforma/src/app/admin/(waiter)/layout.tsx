import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Panel de Mesero' };
}

export default async function WaiterLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, full_name, permissions')
    .eq('id', user.id)
    .single();

  // Acceso permitido a quien tenga la sección "mesero" (staff con permiso,
  // dueño, super admin o el rol deprecado RESTAURANT_WAITER).
  if (!profile || !profile.restaurant_id ||
      !can(profile.role as string, profile.permissions as string[] | null, 'mesero')) {
    redirect('/admin/login');
  }

  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  if (tenantSlug) {
    const tenantData = await getRestaurantBySlug(tenantSlug);
    if (!tenantData || tenantData.restaurant.id !== profile.restaurant_id) {
      redirect('/');
    }
  }

  return <>{children}</>;
}
