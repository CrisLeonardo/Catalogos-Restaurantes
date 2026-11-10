import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { resolveModuleContext } from '@/lib/modules-server';
import { can } from '@/lib/permissions';
import { getEsperaDeRecepcion } from '@/lib/db/waitlist';
import { getMesasLibres } from '@/lib/db/table-sessions';
import { diaDeRecepcion } from '@/lib/recepcion/dia';
import WaitlistPanel from '@/components/admin/waitlist-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Lista de espera – Panel admin' };

export default async function AdminListaEsperaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  // «Lista de espera y reservaciones» o el salón: la recepción (1.7/1.8).
  if (!can(ctx.profile.role, ctx.profile.permissions, 'lista_espera') && !can(ctx.profile.role, ctx.profile.permissions, 'mesas')) {
    redirect(await panelLink('/admin'));
  }

  const mc = await resolveModuleContext('lista_espera');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

  // «Hoy» es el día de negocio del local, no la fecha UTC del servidor (X13).
  const dia = await diaDeRecepcion(mc.restaurantId);
  const [espera, freeTables] = await Promise.all([
    getEsperaDeRecepcion(mc.restaurantId, dia.desde),
    getMesasLibres(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <WaitlistPanel
        restaurantId={mc.restaurantId}
        restaurantName={dia.nombre}
        timezone={dia.timezone}
        etiquetaHoy={dia.etiquetaHoy}
        cola={espera.cola}
        porRevisar={espera.porRevisar}
        historial={espera.historial}
        esperasDeHoy={espera.esperasDeHoy}
        freeTables={freeTables}
      />
    </div>
  );
}
