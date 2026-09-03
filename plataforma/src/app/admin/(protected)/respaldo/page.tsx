import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import RespaldoPanel from '@/components/admin/respaldo-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Respaldo de datos – Panel admin' };

/* ============================================================
   /admin/respaldo — respaldo completo self-service
   ------------------------------------------------------------
   Un solo botón: descarga catálogo + clientes + pedidos en un
   .xlsx con 4 hojas (ver lib/actions/backup.ts). Pensado para que
   el restaurante tenga su propia copia de datos, sin depender de
   soporte — no reemplaza los exports por sección que ya existen
   en Catálogo/Clientes/Pedidos/Finanzas, es un respaldo integral.
   ============================================================ */

export default async function AdminRespaldoPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'respaldo')) redirect(await panelLink('/admin'));

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

  return (
    <div className="anim-fade-up">
      <RespaldoPanel restaurantId={restaurantId} />
    </div>
  );
}
