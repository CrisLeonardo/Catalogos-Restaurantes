import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getWaiterActiveOrders, getActiveTableNumbers, getPendingTableCalls } from '@/lib/db/orders';
import { getOpenTableSessions } from '@/lib/db/table-sessions';
import { getWaiterCatalogCached } from '@/lib/db/menu';
import { getAgentHubInfo } from '@/lib/print-agent';
import WaiterPanel from '@/components/admin/waiter-panel';
import { tipAppliesToType } from '@/lib/theme/resolve';
import type { ThemeConfig } from '@/lib/theme/defaults';

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

  /* La configuración del restaurante NO puede depender de haber entrado por
     el subdominio.
     ------------------------------------------------------------------
     Esto resolvía el tema solo cuando llegaba `x-tenant-slug`, que el proxy
     únicamente pone cuando el host resuelve un tenant. Entrando por el
     dominio raíz (o desde la app de escritorio) la cabecera no existe y la
     pantalla caía a los valores de fábrica: SIN PLANO DEL SALÓN, 20 mesas
     fijas, moneda «Q» y propina apagada. Comprobado: el plano que el dueño
     dibujó salía en Pedidos › Mesas y no salía aquí, y un restaurante de 40
     mesas enseñaba 20.

     `getSalonData()` (mesas/salon-data.ts) ya resolvía este caso desde el
     rediseño de 2026-08-26; el mesero se había quedado atrás. La cascada es
     la misma: el slug del tenant si viene, y si no el del propio
     restaurante, que siempre lo hay porque el restaurante ya está resuelto. */
  const { data: r } = await db
    .from('restaurants')
    .select('name, slug')
    .eq('id', restaurantId)
    .single();

  let restaurantName = (r?.name as string | null) ?? 'Restaurante';
  let resolvedConfig: ThemeConfig | null = null;

  const configSlug = slug ?? (r?.slug as string | null) ?? null;
  if (configSlug) {
    const tenantData = await getRestaurantBySlug(configSlug);
    if (tenantData) {
      restaurantName = tenantData.restaurant.name;
      resolvedConfig = tenantData.resolved.config;
    }
  }

  /* El CATÁLOGO va cacheado y la ocupación no (M-23).
     ------------------------------------------------------------------
     Estaban los dos en el mismo `Promise.all`, así que el menú entero se
     volvía a consultar en Postgres con cada refresco del salón —y el
     salón se refresca con cada plato que cocina acepta—. Los productos
     cambian una vez al día; las mesas, cada minuto. `getWaiterCatalogCached`
     usa la etiqueta `menu:<id>` que ya invalidan las acciones de carta e
     inventario, así que un cambio de menú se sigue viendo al instante. */
  const [catalogo, activeOrders, occupiedSince, tableCalls, seatings, hubInfo] = await Promise.all([
    getWaiterCatalogCached(restaurantId),
    getWaiterActiveOrders(restaurantId, user.id),
    getActiveTableNumbers(restaurantId),
    // Quién llamó al mesero y para qué. Es la mitad de la regla que decide
    // qué mesa pide atención (ver lib/table-state.ts).
    getPendingTableCalls(restaurantId),
    /* Las mesas que alguien sentó y todavía no han pedido (migración 128).
       Sin esto el mesero vería libre una mesa que la hostess acaba de
       sentar, que es la mitad del hallazgo M-02: dos meseros yendo a la
       misma mesa sin saberlo. */
    getOpenTableSessions(restaurantId),
    getAgentHubInfo(restaurantId),
  ]);

  const { categories, products } = catalogo;

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
      seatings={seatings}
      tableCalls={tableCalls}
      tableCount={resolvedConfig?.dineInTableCount ?? 20}
      floorPlan={resolvedConfig?.floorPlan ?? null}
      umbrales={resolvedConfig ? {
        readyMin: resolvedConfig.salonReadyMin,
        unpaidMin: resolvedConfig.salonUnpaidMin,
        unacceptedMin: resolvedConfig.salonUnacceptedMin,
      } : undefined}
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
