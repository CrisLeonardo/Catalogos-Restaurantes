import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { listStaff, getActivityLog } from '@/lib/actions/staff';
import StaffPanel from '@/components/admin/staff-panel';

export const metadata = { title: 'Personal – Panel admin' };

/* /admin/personal — gestión de staff (solo el dueño) + bitácora de actividad. */
export default async function AdminPersonalPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  // Solo el dueño (o super admin) gestiona personal.
  if (ctx.profile.role !== 'RESTAURANT_OWNER' && ctx.profile.role !== 'SUPER_ADMIN') {
    redirect('/admin/menu');
  }

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const [staff, activity] = await Promise.all([
    listStaff(restaurantId),
    getActivityLog(restaurantId, 30),
  ]);

  return (
    <div className="anim-fade-up">
      <StaffPanel restaurantId={restaurantId} staff={staff} activity={activity} />
    </div>
  );
}
