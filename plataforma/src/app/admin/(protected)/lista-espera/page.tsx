import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { resolveModuleContext } from '@/lib/modules-server';
import { can } from '@/lib/permissions';
import { getActiveWaitlist, getRecentWaitlist, getWaitlistSummary } from '@/lib/db/waitlist';
import WaitlistPanel from '@/components/admin/waitlist-panel';

export const metadata = { title: 'Lista de espera – Panel admin' };

export default async function AdminListaEsperaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  // Delegable como permiso propio (ver PLAN_AUDITORIA_LANZAMIENTO.md Fase 3):
  // a diferencia de otros módulos activables, este SÍ respeta permissions[]
  // para que el dueño pueda dárselo a un host/mesero sin abrir el resto del panel.
  if (!can(ctx.profile.role, ctx.profile.permissions, 'lista_espera')) redirect('/admin');

  const mc = await resolveModuleContext('lista_espera');
  if (!mc.ok) redirect('/admin/modulos');

  const [entries, recent, summary] = await Promise.all([
    getActiveWaitlist(mc.restaurantId),
    getRecentWaitlist(mc.restaurantId),
    getWaitlistSummary(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <WaitlistPanel restaurantId={mc.restaurantId} entries={entries} recent={recent} summary={summary} />
    </div>
  );
}
