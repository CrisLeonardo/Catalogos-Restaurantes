import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getAdminContext } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { getReservasDeRecepcion } from '@/lib/db/reservaciones';
import { getMesasConfiguradas, getMesasLibres } from '@/lib/db/table-sessions';
import { diaDeRecepcion } from '@/lib/recepcion/dia';
import { aforoDeMesas } from '@/lib/recepcion/agenda';
import ReservacionesPanel from '@/components/admin/reservaciones-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Reservaciones – Panel admin' };

export default async function ReservacionesPage() {
  const mc = await resolveModuleContext('reservaciones');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));
  const ctx = await getAdminContext();
  const rol = ctx?.profile.role ?? null;
  const permisos = ctx?.profile.permissions ?? null;

  // «Hoy» es el día de negocio del local, no la fecha UTC del servidor (X13).
  const dia = await diaDeRecepcion(mc.restaurantId);
  const [reservas, freeTables, configuredTables] = await Promise.all([
    getReservasDeRecepcion(mc.restaurantId, dia.hoy),
    getMesasLibres(mc.restaurantId),
    getMesasConfiguradas(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <ReservacionesPanel
        restaurantId={mc.restaurantId}
        hoy={dia.hoy}
        etiquetaHoy={dia.etiquetaHoy}
        ahoraNegocio={dia.ahoraNegocio}
        corte={dia.corte}
        duracion={dia.duracion}
        delDia={reservas.delDia}
        proximas={reservas.proximas}
        porRevisar={reservas.porRevisar}
        freeTables={freeTables}
        configuredTables={configuredTables}
        aforo={aforoDeMesas(configuredTables)}
        puedeAjustar={can(rol, permisos, 'ajustes')}
      />
    </div>
  );
}
