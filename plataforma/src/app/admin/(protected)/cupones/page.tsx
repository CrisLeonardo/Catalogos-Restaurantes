import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { actorEn, tiene } from '@/lib/auth/capacidades';
import { accesoCupones, getCoupons } from '@/lib/db/cupones';
import CuponesPanel from '@/components/admin/cupones-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Cupones – Panel admin' };

export default async function CuponesPage() {
  const mc = await resolveModuleContext('cupones');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

  const actor = await actorEn(mc.restaurantId);
  if (!actor || !tiene(actor, 'cupones')) redirect(await panelLink('/admin'));
  const acceso = await accesoCupones(mc.restaurantId);
  if (!acceso?.active) redirect(await panelLink('/admin/modulos'));

  const lectura = await getCoupons(mc.restaurantId);

  return (
    <div className="anim-fade-up">
      {!acceso.acceptsOrders && (
        <div className="glass-quiet" style={{ borderRadius: 'var(--radius-lg)', padding: '12px 16px', fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5, marginBottom: 14 }}>
          Los cupones se aplican en los pedidos en línea. Enciende la función <strong>Pedidos</strong> (desde En línea) para que tus clientes los usen al pagar.
        </div>
      )}
      <CuponesPanel
        restaurantId={mc.restaurantId}
        coupons={lectura.datos}
        estado={lectura.estado}
        leidoEn={lectura.leidoEn}
        timezone={acceso.timezone}
        advanced={acceso.advanced}
      />
    </div>
  );
}
