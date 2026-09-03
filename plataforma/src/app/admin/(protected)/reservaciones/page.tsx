import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getReservations, getReservationSummary } from '@/lib/db/reservaciones';
import ReservacionesPanel from '@/components/admin/reservaciones-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Reservaciones – Panel admin' };

export default async function ReservacionesPage() {
  const mc = await resolveModuleContext('reservaciones');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

  const today = new Date().toISOString().slice(0, 10);
  const [reservations, summary] = await Promise.all([
    getReservations(mc.restaurantId, today),
    getReservationSummary(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <ReservacionesPanel
        restaurantId={mc.restaurantId}
        reservations={reservations}
        summary={summary}
      />
    </div>
  );
}
