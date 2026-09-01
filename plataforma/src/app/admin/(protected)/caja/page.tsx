/* Negocio › Caja — cerrar el día.
   ------------------------------------------------------------------
   El arqueo vivía al final del scroll de Finanzas, como un apéndice
   de un reporte. Pero cerrar caja no es un reporte: es la última
   tarea de todas las noches, la hace el cajero (no el dueño) y tiene
   su propio ritmo —contar, anotar lo que salió, repartir propinas—.

   Por eso ahora es una pestaña suya dentro de Negocio, con el mismo
   candado de permisos que Finanzas: quien puede ver el dinero puede
   cuadrarlo.

   Finanzas no cambió: solo se le quitó el bloque de arqueo del final
   y en su lugar quedó un enlace a esta pantalla. */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getCajaState } from '@/lib/actions/finanzas';
import { can } from '@/lib/permissions';
import CashClose from '@/components/admin/caja/cash-close';
import CashHistoryPanel from '@/components/admin/cash-history-panel';
import { getCashHistory } from '@/lib/actions/finanzas';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Caja – Panel admin' };

/** "Martes 1 de septiembre", en la zona del restaurante. Se arma en el
    servidor a propósito: hacerlo en el cliente da un HTML distinto al
    del servidor en cuanto los dos no están en el mismo huso. */
function fechaLarga(timezone: string): string {
  try {
    const s = new Intl.DateTimeFormat('es-GT', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone,
    }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function AdminCajaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'finanzas')) redirect('/admin');

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;
  let restaurantName = 'Restaurante';

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
      timezone = t?.restaurant.timezone ?? timezone;
      restaurantName = t?.restaurant.name ?? restaurantName;
      ordersEnabled = (t?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    restaurantName = ctx.restaurant?.name ?? restaurantName;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  if (!ordersEnabled) {
    return (
      <EmptyState
        icon="banknote"
        title="La caja todavía no está activa"
        desc="El cierre de caja se basa en los pedidos: cuánto entró en efectivo, qué salió y cuánta propina hubo. Activa el módulo Pedidos (plan Estándar) para empezar a cuadrar."
        action={{ href: '/admin/suscripcion', label: 'Ver planes' }}
      />
    );
  }

  const [state, history] = await Promise.all([
    getCajaState(restaurantId),
    getCashHistory(restaurantId, 10),
  ]);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <CashClose
        restaurantId={restaurantId}
        state={state}
        dateLabel={fechaLarga(timezone)}
        cashierName={ctx.profile.full_name ?? 'Caja'}
        restaurantName={restaurantName}
      />

      {/* Los cierres anteriores viven aquí, no en Finanzas: quien abre esta
          pantalla es quien se pregunta "¿cómo cerró ayer?". */}
      <CashHistoryPanel history={history} restaurantId={restaurantId} />
    </div>
  );
}
