/* Tomar pedidos — el módulo de servicio.
   ------------------------------------------------------------------
   Desde el rediseño del 17 de septiembre de 2026 esta pantalla es UN
   módulo que cubre el turno entero: ver el salón, abrir una mesa, armar
   la comanda, mandarla a cocina, marcar lo servido y cobrar. Ver
   `components/admin/servicio/servicio-panel.tsx` y el handoff
   «Servicio».

   Lo que esta página hace sigue siendo lo de siempre: resolver el
   restaurante, su configuración y sus mesas, y pasárselo todo ya
   resuelto. El panel anterior (`components/admin/waiter-panel.tsx`)
   sigue en el árbol, sin usar, mientras el rediseño está a prueba. */

import { headers } from 'next/headers';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { getActiveTableNumbers, getPendingTableCalls, getWaiterActiveOrders } from '@/lib/db/orders';
import { getOpenTableSessions } from '@/lib/db/table-sessions';
import { getWaiterCatalogCached } from '@/lib/db/menu';
import { withEffectiveAvailability } from '@/lib/product-availability';
import { getMasPedidosCached } from '@/lib/db/servicio';
import { getAgentHubInfo } from '@/lib/print-agent';
import ServicioPanel from '@/components/admin/servicio/servicio-panel';
import { tipAppliesToType } from '@/lib/theme/resolve';
import type { ThemeConfig } from '@/lib/theme/defaults';

export const metadata = { title: 'Tomar pedidos – Panel admin' };

export default async function MeseroPage() {
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const db = createServiceClient();
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug') ?? null;

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, full_name, permissions')
    .eq('id', user.id)
    .single();

  // El restaurante del subdominio si es suyo por membresía: el dueño que se
  // registró desde el modelo de membresías (migración 113) no tiene
  // `restaurant_id` en el perfil, y sin esto la pantalla salía en blanco.
  // SUPER_ADMIN no tiene restaurant_id propio: lo resolvemos del slug de tenant.
  let restaurantId = await resolveOwnRestaurantId(profile?.restaurant_id as string | null);
  if (!restaurantId && profile?.role === 'SUPER_ADMIN' && slug) {
    const tenantData = await getRestaurantBySlug(slug);
    if (tenantData) restaurantId = tenantData.restaurant.id;
  }
  if (!restaurantId) return null;

  /* La configuración del restaurante NO puede depender de haber entrado
     por el subdominio.
     ------------------------------------------------------------------
     Esto resolvía el tema solo cuando llegaba `x-tenant-slug`, que el
     proxy únicamente pone cuando el host resuelve un tenant. Entrando por
     el dominio raíz (o desde la app de escritorio) la cabecera no existe
     y la pantalla caía a los valores de fábrica: SIN PLANO DEL SALÓN, 20
     mesas fijas, moneda «Q» y propina apagada. Comprobado: el plano que
     el dueño dibujó salía en Pedidos › Mesas y no salía aquí, y un
     restaurante de 40 mesas enseñaba 20. */
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
     El salón se refresca con cada plato que cocina acepta; los productos
     cambian una vez al día. `getWaiterCatalogCached` y
     `getMasPedidosCached` usan la etiqueta `menu:<id>` que ya invalidan
     las acciones de carta e inventario, así que un cambio de menú se
     sigue viendo al instante. */
  const [catalogo, masPedidos, activeOrders, occupancy, calls, seatings, hubInfo] = await Promise.all([
    getWaiterCatalogCached(restaurantId),
    getMasPedidosCached(restaurantId),
    getWaiterActiveOrders(restaurantId, user.id),
    getActiveTableNumbers(restaurantId),
    // Quién llamó al mesero y para qué: es la insignia de «alguien
    // levantó la mano» que va encima del estado de la mesa.
    getPendingTableCalls(restaurantId),
    /* Las mesas que alguien sentó y todavía no han pedido (migración 128).
       Sin esto el mesero vería libre una mesa que la hostess acaba de
       sentar, que es la mitad del hallazgo M-02: dos meseros yendo a la
       misma mesa sin saberlo. El handoff del rediseño tampoco lo traía. */
    getOpenTableSessions(restaurantId),
    getAgentHubInfo(restaurantId),
  ]);

  return (
    <ServicioPanel
      waiterId={user.id}
      waiterName={(profile?.full_name as string | null) ?? 'Mesero'}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      logoUrl={resolvedConfig?.logoUrl ?? null}
      categories={catalogo.categories}
      /* Con la disponibilidad que ve el comensal: antes el mesero tenía
         «Agotado» un platillo que el menú ya había devuelto a las 12 h
         (auditoría 2026-10-02, CAT-01). */
      products={withEffectiveAvailability(catalogo.products)}
      masPedidos={masPedidos}
      initialOrders={activeOrders}
      occupancy={occupancy}
      calls={calls}
      seatings={seatings}
      tableCount={resolvedConfig?.dineInTableCount ?? 20}
      floorPlan={resolvedConfig?.floorPlan ?? null}
      tipEnabled={resolvedConfig ? tipAppliesToType(resolvedConfig, 'DINE_IN') : false}
      tipEnabledPickup={resolvedConfig ? tipAppliesToType(resolvedConfig, 'PICKUP') : false}
      // "Para llevar" solo si el restaurante acepta ese tipo de pedido
      // (misma configuración que el menú público).
      pickupEnabled={resolvedConfig ? resolvedConfig.orderTypes.includes('pickup') : true}
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
