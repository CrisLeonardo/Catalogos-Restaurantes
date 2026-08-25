import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import {
  getDriverByProfile, getActiveDriverOrders, getDriverShiftSummary,
} from '@/lib/db/drivers';
import DriverBoard from '@/components/admin/driver-board';

export const metadata = { title: 'Mis entregas – Leogin' };

/* ============================================================
   /repartidor — pantalla del repartidor (Fase 2)
   ------------------------------------------------------------
   Fuera del panel admin a propósito, igual que /admin/mesero es su propia
   pantalla: el repartidor trabaja desde el teléfono, en la calle, y no
   necesita (ni debe ver) el resto del sistema.

   Dos candados: el permiso 'reparto' y estar enlazado a una fila de
   drivers. Tener el permiso sin estar dado de alta no alcanza — así un
   staff con permisos amplios no hereda las entregas de nadie.
   ============================================================ */

export default async function RepartidorPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'reparto')) redirect('/admin');

  const driver = await getDriverByProfile(ctx.profile.id);
  if (!driver || !driver.activo) {
    return (
      <div style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Mis entregas</h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
          Tu usuario todavía no está dado de alta como repartidor, o está
          desactivado. Pedile al encargado que te agregue en Repartidores.
        </p>
      </div>
    );
  }

  const [orders, summary] = await Promise.all([
    getActiveDriverOrders(driver.id),
    getDriverShiftSummary(driver.id),
  ]);

  return <DriverBoard driverName={driver.nombre} orders={orders} summary={summary} />;
}
