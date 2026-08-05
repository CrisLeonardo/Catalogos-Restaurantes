import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { getDrivers, getDriversCashToday } from '@/lib/db/drivers';
import { getDeliveryZones } from '@/lib/db/zones';
import DriversPanel from '@/components/admin/drivers-panel';
import DeliveryZonesEditor from '@/components/admin/delivery-zones-editor';

export const metadata = { title: 'Repartidores – Panel admin' };

/* ============================================================
   /admin/repartidores — alta de repartidores (Fase 2)
   ------------------------------------------------------------
   La asignación de cada pedido se hace desde /admin/pedidos; aquí solo se
   administra quién existe.
   ============================================================ */

export default async function AdminRepartidoresPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'repartidores')) redirect('/admin/menu');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const [drivers, zones, cash, { data: staffRows }] = await Promise.all([
    getDrivers(restaurantId),
    getDeliveryZones(restaurantId),
    getDriversCashToday(restaurantId),
    db
      .from('profiles')
      .select('id, full_name')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'RESTAURANT_STAFF'),
  ]);

  return (
    <div className="anim-fade-up">
      <DriversPanel
        restaurantId={restaurantId}
        drivers={drivers}
        staff={(staffRows ?? []) as { id: string; full_name: string | null }[]}
      />

      {/* Cuadre de caja del día. Sin pagos en línea, el efectivo pasa por las
          manos del repartidor y esto es lo único que permite verificarlo. */}
      {cash.length > 0 && (
        <section style={{ marginTop: 36, maxWidth: 720 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Cuadre de hoy</h2>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 16 }}>
            Solo pedidos en efectivo: los de tarjeta al recibir no pasan por el repartidor.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--u-text-4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '8px 10px 8px 0' }}>Repartidor</th>
                  <th style={{ padding: '8px 10px' }}>Entregas</th>
                  <th style={{ padding: '8px 10px' }}>Esperado</th>
                  <th style={{ padding: '8px 10px' }}>Recibido</th>
                  <th style={{ padding: '8px 10px' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cash.map((r) => (
                  <tr key={r.driverId} style={{ borderTop: '1px solid var(--u-hair)' }}>
                    <td style={{ padding: '10px 10px 10px 0', fontWeight: 600 }}>
                      {r.nombre}
                      {r.sinRegistro > 0 && (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--u-text-4)', fontWeight: 400 }}>
                          {r.sinRegistro} sin monto anotado
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>{r.entregados}</td>
                    <td style={{ padding: '10px' }}>Q{r.esperado.toFixed(2)}</td>
                    <td style={{ padding: '10px' }}>Q{r.recibido.toFixed(2)}</td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>
                      <span className={`chip ${r.diferencia < 0 ? 'chip-danger' : r.diferencia > 0 ? 'chip-warn' : 'chip-ok'}`}>
                        {r.diferencia >= 0 ? '+' : '−'}Q{Math.abs(r.diferencia).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Las zonas viven aquí y no en Perfil: es la misma decisión operativa
          que "quién reparte" — a dónde llego y cuánto cobro por llegar. */}
      <section style={{ marginTop: 36, maxWidth: 720 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Zonas de entrega</h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 16 }}>
          A dónde llega tu reparto y cuánto cobrás por cada zona.
        </p>
        <DeliveryZonesEditor
          restaurantId={restaurantId}
          initialZones={zones.map((z) => ({ nombre: z.nombre, tarifa: z.tarifa }))}
        />
      </section>
    </div>
  );
}
