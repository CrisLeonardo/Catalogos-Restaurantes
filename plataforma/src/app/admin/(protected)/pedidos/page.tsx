import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getPanelOrders, getOrderStats } from '@/lib/db/orders';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import OrdersPanel from '@/components/admin/orders-panel';

export default async function PedidosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  if (!restaurantId) redirect('/admin/menu');

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

  const [panelOrders, stats] = await Promise.all([
    getPanelOrders(restaurantId, timezone),
    getOrderStats(restaurantId, timezone),
  ]);

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
      autoConfirmEnabled={themeConfig.autoConfirmEnabled}
      autoConfirmMinutes={themeConfig.autoConfirmMinutes}
    />
  );
}
