import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getWaiterActiveOrders, getActiveTableNumbers, getPendingTableCalls } from '@/lib/db/orders';
import { getAgentHubInfo } from '@/lib/print-agent';
import WaiterPanel from '@/components/admin/waiter-panel';
import { tipAppliesToType } from '@/lib/theme/resolve';
import type { ThemeConfig } from '@/lib/theme/defaults';
import type { Category, Product } from '@/types';

export const metadata = { title: 'Panel de Mesero' };

export default async function MeseroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug') ?? null;

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, full_name, permissions')
    .eq('id', user.id)
    .single();

  // SUPER_ADMIN no tiene restaurant_id propio: lo resolvemos del slug de tenant.
  let restaurantId = profile?.restaurant_id as string | null ?? null;
  if (!restaurantId && profile?.role === 'SUPER_ADMIN') {
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      if (tenantData) restaurantId = tenantData.restaurant.id;
    }
  }
  if (!restaurantId) return null;
  let restaurantName = 'Restaurante';
  let resolvedConfig: ThemeConfig | null = null;

  if (slug) {
    const tenantData = await getRestaurantBySlug(slug);
    if (tenantData) {
      restaurantName = tenantData.restaurant.name;
      resolvedConfig = tenantData.resolved.config;
    }
  } else {
    const { data: r } = await db.from('restaurants').select('name').eq('id', restaurantId).single();
    restaurantName = (r?.name as string | null) ?? 'Restaurante';
  }

  const [categoriesRes, productsRes, activeOrders, occupiedSince, tableCalls, hubInfo] = await Promise.all([
    db.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
    db.from('products').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
    getWaiterActiveOrders(restaurantId, user.id),
    getActiveTableNumbers(restaurantId),
    // Quién llamó al mesero y para qué. Es la mitad de la regla que decide
    // qué mesa pide atención (ver lib/table-state.ts).
    getPendingTableCalls(restaurantId),
    getAgentHubInfo(restaurantId),
  ]);

  const categories = (categoriesRes.data ?? []) as Category[];
  const products = (productsRes.data ?? []) as Product[];

  return (
    <WaiterPanel
      waiterId={user.id}
      waiterName={(profile?.full_name as string | null) ?? 'Mesero'}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      categories={categories}
      products={products}
      initialOrders={activeOrders}
      occupiedSince={occupiedSince}
      tableCalls={tableCalls}
      tableCount={resolvedConfig?.dineInTableCount ?? 20}
      floorPlan={resolvedConfig?.floorPlan ?? null}
      tipEnabled={resolvedConfig ? tipAppliesToType(resolvedConfig, 'DINE_IN') : false}
      tipEnabledPickup={resolvedConfig ? tipAppliesToType(resolvedConfig, 'PICKUP') : false}
      // "Para llevar" en el panel de mesero solo si el restaurante acepta ese
      // tipo de pedido (misma configuración que el menú público).
      pickupEnabled={resolvedConfig ? resolvedConfig.orderTypes.includes('pickup') : true}
      tipPercent={resolvedConfig?.tipPercent ?? 10}
      currency={{
        symbol: resolvedConfig?.currencySymbol ?? 'Q',
        position: resolvedConfig?.currencyPosition ?? 'prefix',
        locale: resolvedConfig?.locale ?? 'es-GT',
      }}
      hubUrl={hubInfo.hubUrl}
      hubToken={hubInfo.hubToken}
    />
  );
}
