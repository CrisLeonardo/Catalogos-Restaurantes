import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getCoupons } from '@/lib/db/cupones';
import CuponesPanel from '@/components/admin/cupones-panel';

export const metadata = { title: 'Cupones – Panel admin' };

export default async function CuponesPage() {
  const mc = await resolveModuleContext('cupones');
  if (!mc.ok) redirect('/admin/modulos');

  const coupons = await getCoupons(mc.restaurantId);

  return (
    <div className="anim-fade-up">
      <CuponesPanel restaurantId={mc.restaurantId} coupons={coupons} />
    </div>
  );
}
