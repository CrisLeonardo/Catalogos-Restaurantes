import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCoupons } from '@/lib/db/cupones';
import CuponesPanel from '@/components/admin/cupones-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Cupones – Panel admin' };

export default async function CuponesPage() {
  const mc = await resolveModuleContext('cupones');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('modules')
    .eq('id', mc.restaurantId)
    .single();
  const ordersEnabled = (rest?.modules as { orders?: boolean } | null)?.orders === true;

  const coupons = await getCoupons(mc.restaurantId);

  return (
    <div className="anim-fade-up">
      {!ordersEnabled && (
        <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, marginBottom: 14 }}>
          Los cupones se aplican en los pedidos en línea. Activa el módulo <strong>Pedidos</strong> (plan Estándar) para que tus clientes los usen al pagar.
        </div>
      )}
      <CuponesPanel restaurantId={mc.restaurantId} coupons={coupons} />
    </div>
  );
}
