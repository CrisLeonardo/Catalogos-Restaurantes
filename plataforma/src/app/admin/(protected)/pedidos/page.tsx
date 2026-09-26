import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getPanelOrders, getOrderStats, getDayPace, orderClosedAt } from '@/lib/db/orders';
import type { TimesData } from '@/components/admin/times-widget';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { getFallosDeImpresion } from '@/lib/db/print-stations';
import OrdersPanel from '@/components/admin/orders-panel';
import { getDrivers } from '@/lib/db/drivers';
import { mesaDeFila, direccionDeMesa } from '@/lib/mesa';
import { panelLink } from '@/lib/panel-links-server';

/* Sin título propio la pestaña heredaba el del menú público: «Menú en
   línea» estando en Pedidos, justo la pantalla que se deja abierta todo
   el turno en otra pestaña. */
export const metadata = { title: 'Pedidos en vivo – Panel admin' };

/** Cómo se nombra un pedido en una frase: la mesa si la hay, si no el canal. */
function orderShortLabel(o: { order_type: string; address: string | null; table_number?: number | null }): string {
  if (o.order_type === 'DINE_IN') {
    const n = mesaDeFila(o);
    return n != null ? `la ${direccionDeMesa(n)}` : 'un pedido en local';
  }
  return o.order_type === 'PICKUP' ? 'un pedido para llevar' : 'un domicilio';
}

export default async function PedidosPage() {
  const { data: { user } } = await getStaffUser();
  if (!user) redirect('/admin/login');

  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const { profile } = ctx;
  const headersList = await headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  let restaurantId: string | null = null;

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const td = await getRestaurantBySlug(tenantSlug);
      restaurantId = td?.restaurant.id ?? null;
    }
  } else {
    restaurantId = profile.restaurant_id;
  }

  if (!restaurantId) redirect(await panelLink('/admin'));

  // Zona horaria + moneda reales del restaurante (KPIs y montos honestos).
  const db = createServiceClient();
  const [{ data: restaurant }, { data: themeRow }, { data: agent }] = await Promise.all([
    db.from('restaurants').select('timezone, name').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single(),
    db.from('print_agents').select('kitchen_target, receipt_target').eq('restaurant_id', restaurantId).single(),
  ]);
  const timezone = (restaurant?.timezone as string) || 'America/Guatemala';
  const restaurantName = (restaurant as { name?: string } | null)?.name ?? '';
  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;
  const agentKitchen = !!(agent?.kitchen_target);
  const agentReceipt = !!(agent?.receipt_target);

  const [panelOrders, stats, drivers, pace] = await Promise.all([
    getPanelOrders(restaurantId, timezone),
    getOrderStats(restaurantId, timezone),
    getDrivers(restaurantId),
    // Con qué comparar el día. Es la misma pieza que la portada Hoy, así que
    // también necesita su referencia; la consulta va acotada a los cuatro
    // días iguales anteriores.
    getDayPace(restaurantId, timezone),
  ]);

  /* ── Tiempos de hoy ──────────────────────────────────────────
     Cuánto se tardó de verdad hoy, de que entra el pedido a que se entrega.
     La cocina no sabe si va lenta hasta que alguien se queja, y ese número no
     estaba en ninguna pantalla.

     Sin consulta nueva: se calcula sobre los pedidos que YA se cargaron para
     pintar el historial del día. Los cancelados quedan fuera —el tiempo de un
     pedido que nunca se sirvió no mide a la cocina— y también los que salen
     por debajo de un minuto, que en la práctica son cierres a mano de algo
     que ya se había entregado. */
  /* Qué estaciones NO imprimieron (migración 130, M-07). Va después de
     los pedidos porque necesita sus ids, y solo sobre los VIVOS: un fallo
     de impresión de un pedido ya entregado no tiene remedio útil.
     Devuelve {} donde no hay estaciones, que es como estaba todo hasta la
     fase 3 de M-07. */
  const fallosDeImpresion = await getFallosDeImpresion(
    restaurantId,
    panelOrders.active.map((o) => o.id),
  );

  const SLOW_MINUTES = 30;
  const duraciones = panelOrders.closedToday
    .filter((o) => o.status === 'DELIVERED')
    .map((o) => (new Date(orderClosedAt(o)).getTime() - new Date(o.created_at).getTime()) / 60_000)
    .filter((m) => m >= 1 && m < 24 * 60);

  let times: TimesData | null = null;
  if (duraciones.length >= 3) {
    const slow = duraciones.filter((m) => m > SLOW_MINUTES).length;
    // El peor del día solo se nombra si de verdad se pasó: señalar "el más
    // lento fue de 12 minutos" en un día bueno es ruido con forma de alarma.
    const peorMin = Math.max(...duraciones);
    const peor = panelOrders.closedToday.find(
      (o) => o.status === 'DELIVERED'
        && Math.abs((new Date(orderClosedAt(o)).getTime() - new Date(o.created_at).getTime()) / 60_000 - peorMin) < 0.01,
    );
    times = {
      avgTotal: Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length),
      slow,
      sample: duraciones.length,
      worst: peorMin > SLOW_MINUTES && peor
        ? { label: orderShortLabel(peor), minutes: Math.round(peorMin) }
        : null,
    };
  }

  // Solo los activos: un repartidor dado de baja no debe poder recibir
  // entregas nuevas, aunque siga siendo el responsable de las que ya hizo.
  const activeDrivers = drivers
    .filter((d) => d.activo)
    .map((d) => ({ id: d.id, nombre: d.nombre }));

  return (
    <OrdersPanel
      activeOrders={panelOrders.active}
      closedToday={panelOrders.closedToday}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      stats={stats}
      timezone={timezone}
      currency={{
        symbol: themeConfig.currencySymbol,
        position: themeConfig.currencyPosition,
        locale: themeConfig.locale,
      }}
      kitchenYellowMin={themeConfig.kdsYellowMin}
      kitchenRedMin={themeConfig.kdsRedMin}
      agentKitchen={agentKitchen}
      agentReceipt={agentReceipt}
      fallosDeImpresion={fallosDeImpresion}
      autoConfirmEnabled={themeConfig.autoConfirmEnabled}
      autoConfirmMinutes={themeConfig.autoConfirmMinutes}
      drivers={activeDrivers}
      times={times}
      pace={pace}
    />
  );
}
